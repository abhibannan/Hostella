import { Router } from "express";
import { z } from "zod";

import { db } from "../../config/firebase.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireHostelAccess } from "../../middleware/hostel-access.middleware.js";
import { requireRenterAccess } from "../../middleware/requireRenterAccess.js";
import { writeAuditLog } from "../../utils/audit.js";
import { registerCacheInvalidator, invalidateHostelCaches } from "../../utils/cache.js";
import { checkAndProcessRecurringFees } from "../../services/recurring-fees.service.js";

const router = Router();

const feesCache = new Map<string, { fees: any[]; expiresAt: number }>();
export function clearFeesCache(hostelId?: string | string[]) {
  if (typeof hostelId === "string") feesCache.delete(hostelId);
  else if (Array.isArray(hostelId)) hostelId.forEach((id) => feesCache.delete(id));
  else feesCache.clear();
}
registerCacheInvalidator((hId) => clearFeesCache(hId));

const createFeeSchema = z.object({
  renterId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.number().positive(),
  dueDate: z.string().min(1),
  description: z.string().trim().max(500).optional(),
});

const updateFeeSchema = z.object({
  amount: z.number().positive().optional(),
  dueDate: z.string().min(1).optional(),
  description: z.string().trim().max(500).optional(),
  status: z
    .enum([
      "PENDING",
      "PARTIALLY_PAID",
      "PAID",
      "OVERDUE",
      "CANCELLED",
    ])
    .optional(),
});

const paymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum([
    "CASH",
    "UPI",
    "BANK_TRANSFER",
    "OTHER",
  ]),
  paymentDate: z.string().min(1),
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
});

// Create fee
router.post(
  "/:hostelId/fees",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN" &&
        req.authUser?.role !== "PARTNER"
      ) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const hostelId = req.params.hostelId;

      if (typeof hostelId !== "string") {
        res.status(400).json({ message: "Invalid hostel ID" });
        return;
      }

      const parsed = createFeeSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          message: "Invalid fee data",
          errors: parsed.error.flatten(),
        });
        return;
      }

      const {
        renterId,
        month,
        amount,
        dueDate,
        description,
      } = parsed.data;

      const renterRef = db.collection("renters").doc(renterId);
      const renter = await renterRef.get();

      if (
        !renter.exists ||
        renter.data()?.hostelId !== hostelId
      ) {
        res.status(404).json({
          message: "Renter not found",
        });
        return;
      }

      if (renter.data()?.status !== "ACTIVE") {
        res.status(400).json({
          message: "Renter is not active",
        });
        return;
      }

      const existing = await db
        .collection("fees")
        .where("hostelId", "==", hostelId)
        .where("renterId", "==", renterId)
        .where("month", "==", month)
        .limit(1)
        .get();

      if (!existing.empty) {
        res.status(409).json({
          message: "Fee already exists for this month",
        });
        return;
      }

      const feeRef = db.collection("fees").doc();
      const now = new Date().toISOString();

      const fee = {
        id: feeRef.id,
        hostelId,
        renterId,
        month,
        amount,
        paidAmount: 0,
        dueDate,
        description: description ?? null,
        status: "PENDING",
        createdAt: now,
        updatedAt: now,
      };

      await feeRef.set(fee);

      await writeAuditLog({
        actorId: req.authUser.id,
        action: "CREATE_FEE",
        entityType: "FEE",
        entityId: feeRef.id,
        metadata: {
          hostelId,
          renterId,
          month,
          amount,
        },
      });

      invalidateHostelCaches(hostelId);
      res.status(201).json({
        message: "Fee created successfully",
        fee,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Generate recurring monthly fees for all active renters in hostel
router.post(
  "/:hostelId/fees/generate-monthly",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN" &&
        req.authUser?.role !== "PARTNER"
      ) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const hostelId = req.params.hostelId;
      const { month, dueDate, description } = req.body;

      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        res.status(400).json({ message: "Month must be in YYYY-MM format" });
        return;
      }

      if (!dueDate) {
        res.status(400).json({ message: "Due date is required" });
        return;
      }

      const rentersSnapshot = await db
        .collection("renters")
        .where("hostelId", "==", hostelId)
        .where("status", "==", "ACTIVE")
        .get();

      if (rentersSnapshot.empty) {
        res.json({ message: "No active renters found in this hostel", generatedCount: 0, skippedCount: 0 });
        return;
      }

      const existingFeesSnapshot = await db
        .collection("fees")
        .where("hostelId", "==", hostelId)
        .where("month", "==", month)
        .get();

      const existingRenterIds = new Set(
        existingFeesSnapshot.docs.map((doc) => doc.data().renterId)
      );

      const batch = db.batch();
      const now = new Date().toISOString();
      let generatedCount = 0;
      let skippedCount = 0;

      for (const renterDoc of rentersSnapshot.docs) {
        const renter = renterDoc.data();
        if (existingRenterIds.has(renterDoc.id)) {
          skippedCount++;
          continue;
        }

        const amount = Number(renter.monthlyFee || 0);
        if (amount <= 0) {
          skippedCount++;
          continue;
        }

        const feeRef = db.collection("fees").doc();
        batch.set(feeRef, {
          id: feeRef.id,
          hostelId,
          renterId: renterDoc.id,
          month,
          amount,
          paidAmount: 0,
          dueDate,
          description: description || `Rent fee for ${month}`,
          status: "PENDING",
          createdAt: now,
          updatedAt: now,
        });

        if (renter.userId) {
          const notifRef = db.collection("notifications").doc();
          batch.set(notifRef, {
            id: notifRef.id,
            userId: renter.userId,
            type: "FEE_DUE",
            title: `Rent Due for ${month}: ₹${amount}`,
            message: `Your monthly rent of ₹${amount} for ${month} is due on ${dueDate}. Please pay promptly.`,
            hostelId,
            entityType: "FEE",
            entityId: feeRef.id,
            read: false,
            readAt: null,
            createdAt: now,
          });
        }

        generatedCount++;
      }

      if (generatedCount > 0) {
        await batch.commit();
        await writeAuditLog({
          actorId: req.authUser.id,
          action: "GENERATE_MONTHLY_FEES",
          entityType: "FEE",
          entityId: String(hostelId),
          metadata: { month, dueDate, generatedCount, skippedCount },
        });
      }

      invalidateHostelCaches(hostelId);
      res.status(201).json({
        message: `Generated ${generatedCount} fee record${generatedCount === 1 ? '' : 's'} (${skippedCount} already existed or skipped)`,
        generatedCount,
        skippedCount,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Scan and update overdue fees
router.post(
  "/:hostelId/fees/mark-overdue",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN" &&
        req.authUser?.role !== "PARTNER"
      ) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const hostelId = req.params.hostelId;
      const todayStr = new Date().toISOString().slice(0, 10);

      const feesSnapshot = await db
        .collection("fees")
        .where("hostelId", "==", hostelId)
        .where("status", "in", ["PENDING", "PARTIALLY_PAID"])
        .get();

      const batch = db.batch();
      let overdueCount = 0;
      const now = new Date().toISOString();

      feesSnapshot.docs.forEach((doc) => {
        const fee = doc.data();
        if (fee.dueDate && fee.dueDate < todayStr) {
          batch.update(doc.ref, {
            status: "OVERDUE",
            updatedAt: now,
          });
          overdueCount++;
        }
      });

      if (overdueCount > 0) {
        await batch.commit();
        void checkAndProcessRecurringFees().catch(() => {});
      }

      res.json({
        message: `Updated ${overdueCount} fee${overdueCount === 1 ? '' : 's'} to OVERDUE`,
        overdueCount,
      });
    } catch (error) {
      next(error);
    }
  },
);

// List fees for hostel
router.get(
  "/:hostelId/fees",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      const hostelId = req.params.hostelId;

      if (typeof hostelId !== "string") {
        res.status(400).json({ message: "Invalid hostel ID" });
        return;
      }

      // Renters should not receive the complete hostel fee list.
      if (req.authUser?.role === "RENTER") {
        res.status(403).json({
          message: "Access denied",
        });
        return;
      }

      const cached = feesCache.get(hostelId);
      if (cached && cached.expiresAt > Date.now()) {
        res.json({ fees: cached.fees });
        return;
      }

      const snapshot = await db
        .collection("fees")
        .where("hostelId", "==", hostelId)
        .get();

      const fees = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      feesCache.set(hostelId, {
        fees,
        expiresAt: Date.now() + 4000,
      });

      res.json({ fees });
    } catch (error) {
      next(error);
    }
  },
);

// Get renter fees
router.get(
  "/:hostelId/renters/:renterId/fees",
  requireAuth,
  requireHostelAccess,
  requireRenterAccess,
  async (req, res, next) => {
    try {
      const hostelId = req.params.hostelId;
      const renterId = req.params.renterId;

      if (
        typeof hostelId !== "string" ||
        typeof renterId !== "string"
      ) {
        res.status(400).json({ message: "Invalid ID" });
        return;
      }

      const renter = await db
        .collection("renters")
        .doc(renterId)
        .get();

      if (
        !renter.exists ||
        renter.data()?.hostelId !== hostelId
      ) {
        res.status(404).json({
          message: "Renter not found",
        });
        return;
      }

      const snapshot = await db
        .collection("fees")
        .where("hostelId", "==", hostelId)
        .where("renterId", "==", renterId)
        .get();

      const fees = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      res.json({ fees });
    } catch (error) {
      next(error);
    }
  },
);

// Update fee
router.patch(
  "/:hostelId/fees/:feeId",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN" &&
        req.authUser?.role !== "PARTNER"
      ) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const hostelId = req.params.hostelId;
      const feeId = req.params.feeId;

      if (
        typeof hostelId !== "string" ||
        typeof feeId !== "string"
      ) {
        res.status(400).json({ message: "Invalid ID" });
        return;
      }

      const parsed = updateFeeSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          message: "Invalid fee data",
          errors: parsed.error.flatten(),
        });
        return;
      }

      const feeRef = db.collection("fees").doc(feeId);
      const fee = await feeRef.get();

      if (
        !fee.exists ||
        fee.data()?.hostelId !== hostelId
      ) {
        res.status(404).json({
          message: "Fee not found",
        });
        return;
      }

      const current = fee.data();

      if (
        parsed.data.amount !== undefined &&
        parsed.data.amount <
          Number(current?.paidAmount ?? 0)
      ) {
        res.status(400).json({
          message: "Fee amount cannot be lower than paid amount",
        });
        return;
      }

      await feeRef.update({
        ...parsed.data,
        updatedAt: new Date().toISOString(),
      });

      const updated = await feeRef.get();

      await writeAuditLog({
        actorId: req.authUser.id,
        action: "UPDATE_FEE",
        entityType: "FEE",
        entityId: feeId,
        metadata: parsed.data,
      });

      invalidateHostelCaches(hostelId);

      res.json({
        message: "Fee updated successfully",
        fee: {
          id: updated.id,
          ...updated.data(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// Record payment
router.post(
  "/:hostelId/fees/:feeId/payments",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN" &&
        req.authUser?.role !== "PARTNER"
      ) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const hostelId = req.params.hostelId;
      const feeId = req.params.feeId;

      if (
        typeof hostelId !== "string" ||
        typeof feeId !== "string"
      ) {
        res.status(400).json({ message: "Invalid ID" });
        return;
      }

      const parsed = paymentSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          message: "Invalid payment data",
          errors: parsed.error.flatten(),
        });
        return;
      }

      const feeRef = db.collection("fees").doc(feeId);
      const fee = await feeRef.get();

      if (
        !fee.exists ||
        fee.data()?.hostelId !== hostelId
      ) {
        res.status(404).json({
          message: "Fee not found",
        });
        return;
      }

      const feeData = fee.data();

      if (!feeData) {
        res.status(404).json({
          message: "Fee data not found",
        });
        return;
      }

      if (feeData.status === "CANCELLED") {
        res.status(400).json({
          message: "Cannot pay a cancelled fee",
        });
        return;
      }

      const renterId = String(feeData.renterId ?? "");

      if (!renterId) {
        res.status(400).json({
          message: "Fee is missing renter information",
        });
        return;
      }

      const currentPaid = Number(
        feeData.paidAmount ?? 0,
      );

      const feeAmount = Number(
        feeData.amount ?? 0,
      );

      const paymentAmount = parsed.data.amount;
      const remaining = feeAmount - currentPaid;

      if (paymentAmount > remaining) {
        res.status(400).json({
          message: "Payment amount exceeds remaining fee",
          remainingAmount: remaining,
        });
        return;
      }

      const newPaidAmount =
        currentPaid + paymentAmount;

      let status:
        | "PENDING"
        | "PARTIALLY_PAID"
        | "PAID"
        | "OVERDUE";

      if (newPaidAmount >= feeAmount) {
        status = "PAID";
      } else if (newPaidAmount > 0) {
        status = "PARTIALLY_PAID";
      } else {
        status = "PENDING";
      }

      const paymentRef =
        db.collection("payments").doc();

      const now = new Date().toISOString();

      const payment = {
        id: paymentRef.id,
        hostelId,
        renterId,
        feeId,
        amount: paymentAmount,
        paymentMethod:
          parsed.data.paymentMethod,
        paymentDate:
          parsed.data.paymentDate,
        reference:
          parsed.data.reference ?? null,
        notes:
          parsed.data.notes ?? null,
        recordedBy: req.authUser.id,
        createdAt: now,
      };

      const batch = db.batch();

      batch.set(paymentRef, payment);

      batch.update(feeRef, {
        paidAmount: newPaidAmount,
        status,
        updatedAt: now,
      });

      await batch.commit();

      await writeAuditLog({
        actorId: req.authUser.id,
        action: "RECORD_PAYMENT",
        entityType: "PAYMENT",
        entityId: paymentRef.id,
        metadata: {
          hostelId,
          feeId,
          renterId,
          amount: paymentAmount,
          paymentMethod:
            parsed.data.paymentMethod,
        },
      });

      invalidateHostelCaches(hostelId);
      res.status(201).json({
        message: "Payment recorded successfully",
        payment,
        fee: {
          id: feeId,
          amount: feeAmount,
          paidAmount: newPaidAmount,
          remainingAmount:
            feeAmount - newPaidAmount,
          status,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// Payment history for fee
router.get(
  "/:hostelId/fees/:feeId/payments",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      const hostelId = req.params.hostelId;
      const feeId = req.params.feeId;

      if (
        typeof hostelId !== "string" ||
        typeof feeId !== "string"
      ) {
        res.status(400).json({ message: "Invalid ID" });
        return;
      }

      const fee = await db
        .collection("fees")
        .doc(feeId)
        .get();

      if (
        !fee.exists ||
        fee.data()?.hostelId !== hostelId
      ) {
        res.status(404).json({
          message: "Fee not found",
        });
        return;
      }

      const feeData = fee.data();

      if (!feeData) {
        res.status(404).json({
          message: "Fee data not found",
        });
        return;
      }

      // Renter can only view payment history for their own fee.
      if (req.authUser?.role === "RENTER") {
        const renterId = String(
          feeData.renterId ?? "",
        );

        if (!renterId) {
          res.status(404).json({
            message: "Fee renter information not found",
          });
          return;
        }

        const renter = await db
          .collection("renters")
          .doc(renterId)
          .get();

        if (
          !renter.exists ||
          renter.data()?.userId !== req.authUser.id ||
          renter.data()?.hostelId !== hostelId
        ) {
          res.status(403).json({
            message: "Access denied",
          });
          return;
        }
      }

      const snapshot = await db
        .collection("payments")
        .where("hostelId", "==", hostelId)
        .where("feeId", "==", feeId)
        .get();

      const payments = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      res.json({ payments });
    } catch (error) {
      next(error);
    }
  },
);

// All payments for hostel
router.get(
  "/:hostelId/payments",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN" &&
        req.authUser?.role !== "PARTNER"
      ) {
        res.status(403).json({
          message: "Access denied",
        });
        return;
      }

      const hostelId = req.params.hostelId;

      if (typeof hostelId !== "string") {
        res.status(400).json({
          message: "Invalid hostel ID",
        });
        return;
      }

      const snapshot = await db
        .collection("payments")
        .where("hostelId", "==", hostelId)
        .get();

      const payments = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      res.json({ payments });
    } catch (error) {
      next(error);
    }
  },
);

// Delete fee record
router.delete(
  "/:hostelId/fees/:feeId",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN" &&
        req.authUser?.role !== "PARTNER"
      ) {
        res.status(403).json({
          message: "Only administrators can delete fee records",
        });
        return;
      }

      const hostelId = typeof req.params.hostelId === "string" ? req.params.hostelId : "";
      const feeId = typeof req.params.feeId === "string" ? req.params.feeId : "";

      if (!hostelId || !feeId) {
        res.status(400).json({ message: "Invalid ID parameters" });
        return;
      }

      const feeRef = db.collection("fees").doc(feeId);
      const feeDoc = await feeRef.get();

      if (!feeDoc.exists || feeDoc.data()?.hostelId !== hostelId) {
        res.status(404).json({ message: "Fee record not found" });
        return;
      }

      const feeData = feeDoc.data();

      // Delete fee doc
      await feeRef.delete();

      // Clean up linked payments
      const linkedPayments = await db
        .collection("payments")
        .where("hostelId", "==", hostelId)
        .where("feeId", "==", feeId)
        .get();

      const batch = db.batch();
      linkedPayments.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      if (!linkedPayments.empty) {
        await batch.commit();
      }

      await writeAuditLog({
        actorId: req.authUser!.id,
        action: "DELETE_FEE",
        entityType: "FEE",
        entityId: feeId,
        metadata: {
          hostelId,
          renterId: feeData?.renterId,
          month: feeData?.month,
          amount: feeData?.amount,
        },
      });

      invalidateHostelCaches(hostelId);

      res.json({
        message: "Fee record and associated payments deleted successfully",
        feeId,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;