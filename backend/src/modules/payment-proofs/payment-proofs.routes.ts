import { Router } from "express";
import { z } from "zod";
import { db, storage } from "../../config/firebase.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireHostelAccess } from "../../middleware/hostel-access.middleware.js";
import { writeAuditLog } from "../../utils/audit.js";


const router = Router();

const submitPaymentProofSchema = z.object({
  renterId: z.string().min(1),
  feeId: z.string().min(1),
  amount: z.number().positive(),
  paymentDate: z.string().min(1),
  proofUploadId: z.string().min(1),
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
});

const reviewPaymentProofSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().trim().max(500).optional(),
});

// Cache signed URLs to avoid expensive repetitive Cloud Storage signing
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const paymentsCache = new Map<string, { payments: any[]; expiresAt: number }>();

export function clearPaymentsCache(hostelId?: string) {
  if (hostelId) {
    for (const key of paymentsCache.keys()) {
      if (key.startsWith(hostelId)) paymentsCache.delete(key);
    }
  } else {
    paymentsCache.clear();
  }
}

async function resolveProofUrlsForPayments(
  documents: (FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot)[],
  req?: any,
) {
  const now = Date.now();
  const rawList = documents.map((doc) => ({
    id: doc.id,
    ...(doc.data() ?? {}),
  })) as Record<string, any>[];

  const host = req?.get ? req.get("host") : null;
  const protocol = req?.protocol || (req?.secure ? "https" : "http");
  const defaultHost = process.env.APP_URL || "https://staynexa-1.onrender.com";
  const baseUrl = host ? `${protocol}://${host}` : defaultHost;

  // Identify upload IDs that need resolution
  const missingUploadIds = new Set<string>();
  for (const item of rawList) {
    const uploadId = String(item.proofUploadId ?? "");
    if (uploadId) {
      const cached = signedUrlCache.get(uploadId);
      if (!cached || cached.expiresAt <= now) {
        missingUploadIds.add(uploadId);
      }
    }
  }

  // Batch-fetch all missing upload documents in 1 single Firestore call
  if (missingUploadIds.size > 0) {
    const uploadRefs = Array.from(missingUploadIds).map((id) => db.collection("uploads").doc(id));
    const uploadSnaps = await db.getAll(...uploadRefs);
    await Promise.all(
      uploadSnaps.map(async (snap) => {
        if (!snap.exists) return;
        const uploadId = snap.id;
        const storagePath = String(snap.data()?.storagePath ?? "");
        
        const proofUrl = baseUrl
          ? `${baseUrl}/api/v1/uploads/${uploadId}/file`
          : `/api/v1/uploads/${uploadId}/file`;

        signedUrlCache.set(uploadId, {
          url: proofUrl,
          expiresAt: now + 45 * 60 * 1000,
        });
      })
    );
  }

  // Attach resolved proof URLs
  for (const item of rawList) {
    const uploadId = String(item.proofUploadId ?? "");
    if (uploadId) {
      const cached = signedUrlCache.get(uploadId);
      if (cached && cached.expiresAt > now) {
        item.proofUrl = cached.url;
      }
    }
  }

  return rawList;
}

router.get(
  "/:hostelId/payments",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      const hostelId = req.params.hostelId;
      if (typeof hostelId !== "string") {
        res.status(400).json({ message: "Invalid hostel ID" });
        return;
      }

      const cacheKey = `${hostelId}:${req.authUser?.role}:${req.authUser?.id}`;
      const cached = paymentsCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        res.json({ payments: cached.payments });
        return;
      }

      const snapshot = await db
        .collection("payments")
        .where("hostelId", "==", hostelId)
        .get();

      let documents = snapshot.docs;
      if (req.authUser?.role === "RENTER") {
        const renterSnapshot = await db
          .collection("renters")
          .where("hostelId", "==", hostelId)
          .where("userId", "==", req.authUser.id)
          .where("status", "==", "ACTIVE")
          .limit(1)
          .get();
        const renterId = renterSnapshot.docs[0]?.id;
        documents = renterId
          ? documents.filter((document) => document.data().renterId === renterId)
          : [];
      }

      const payments = await resolveProofUrlsForPayments(documents, req);
      payments.sort((a, b) =>
        String(b.submittedAt ?? b.createdAt ?? "").localeCompare(
          String(a.submittedAt ?? a.createdAt ?? ""),
        ),
      );

      paymentsCache.set(cacheKey, {
        payments,
        expiresAt: Date.now() + 4000, // 4-second burst cache
      });

      res.json({ payments });
    } catch (error) {
      next(error);
    }
  },
);

/*
 * The actual payment happens outside Hostella.
 * This endpoint only submits a screenshot/payment-proof record.
 * The fee is NOT marked paid here.
 */
router.post(
  "/:hostelId/payment-proofs",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (req.authUser?.role !== "RENTER") {
        res.status(403).json({
          message: "Only renters can submit payment proof",
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

      const parsed = submitPaymentProofSchema.safeParse(
        req.body,
      );

      if (!parsed.success) {
        res.status(400).json({
          message: "Invalid payment proof data",
          errors: parsed.error.flatten(),
        });
        return;
      }

      const {
        renterId,
        feeId,
        amount,
        paymentDate,
        proofUploadId,
        reference,
        notes,
      } = parsed.data;

      const renterRef = db
        .collection("renters")
        .doc(renterId);

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

      if (renter.data()?.userId !== req.authUser.id) {
        res.status(403).json({
          message: "Access denied",
        });
        return;
      }

      const feeRef = db
        .collection("fees")
        .doc(feeId);

      const fee = await feeRef.get();

      if (
        !fee.exists ||
        fee.data()?.hostelId !== hostelId ||
        fee.data()?.renterId !== renterId
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
          message:
            "Cannot submit proof for a cancelled fee",
        });
        return;
      }

      const paidAmount = Number(
        feeData.paidAmount ?? 0,
      );

      const feeAmount = Number(
        feeData.amount ?? 0,
      );

      const remaining = feeAmount - paidAmount;

      if (remaining <= 0) {
        res.status(400).json({
          message: "This fee is already fully paid",
        });
        return;
      }

      if (amount > remaining) {
        res.status(400).json({
          message:
            "Payment proof amount exceeds the remaining fee",
          remainingAmount: remaining,
        });
        return;
      }

      const uploadSnapshot = await db
        .collection("uploads")
        .doc(proofUploadId)
        .get();

      if (
        !uploadSnapshot.exists ||
        uploadSnapshot.data()?.userId !== req.authUser.id ||
        !uploadSnapshot.data()?.storagePath
      ) {
        res.status(400).json({ message: "A valid uploaded payment proof is required" });
        return;
      }

      // Prevent multiple pending proofs for the same fee.
      const existingSnapshot = await db
        .collection("payments")
        .where("hostelId", "==", hostelId)
        .where("feeId", "==", feeId)
        .get();

      const hasPendingProof = existingSnapshot.docs.some(
        (doc) => {
          const data = doc.data();
          return (
            data.renterId === renterId &&
            String(data.status || "").toUpperCase() ===
              "SUBMITTED"
          );
        },
      );

      if (hasPendingProof) {
        res.status(409).json({
          message:
            "A payment proof is already waiting for admin review",
        });
        return;
      }

      const paymentRef = db
        .collection("payments")
        .doc();

      const now = new Date().toISOString();
      const defaultHost = process.env.APP_URL || "https://staynexa-1.onrender.com";
      const host = req?.get ? req.get("host") : null;
      const protocol = req?.protocol || (req?.secure ? "https" : "http");
      const baseUrl = host ? `${protocol}://${host}` : defaultHost;
      const proofUrl = `${baseUrl}/api/v1/uploads/${proofUploadId}/file`;

      const payment = {
        id: paymentRef.id,
        hostelId,
        renterId,
        feeId,
        amount,
        paymentDate,
        proofUploadId,
        proofUrl,
        reference: reference ?? null,
        notes: notes ?? null,
        status: "SUBMITTED",
        submittedBy: req.authUser.id,
        submittedAt: now,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: now,
      };

      await paymentRef.set(payment);

      await writeAuditLog({
        actorId: req.authUser.id,
        action: "SUBMIT_PAYMENT_PROOF",
        entityType: "PAYMENT",
        entityId: paymentRef.id,
        metadata: {
          hostelId,
          renterId,
          feeId,
          amount,
        },
      });

      const assignmentSnapshot = await db
        .collection("hostelAdmins")
        .doc(hostelId)
        .get();
      const adminId = String(assignmentSnapshot.data()?.adminId ?? "");
      if (adminId) {
        // notification logic removed
      }

      clearPaymentsCache(hostelId);

      res.status(201).json({
        message: "Payment proof submitted successfully",
        payment,
      });
    } catch (error) {
      next(error);
    }
  },
);

/*
 * Admin review of an uploaded payment proof.
 * APPROVED updates the fee's paidAmount/status.
 * REJECTED leaves the fee unchanged.
 */
router.patch(
  "/:hostelId/payments/:paymentId/status",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN"
      ) {
        res.status(403).json({
          message: "Access denied",
        });
        return;
      }

      const hostelId = req.params.hostelId;
      const paymentId = req.params.paymentId;

      if (
        typeof hostelId !== "string" ||
        typeof paymentId !== "string"
      ) {
        res.status(400).json({
          message: "Invalid ID",
        });
        return;
      }

      const parsed = reviewPaymentProofSchema.safeParse(
        req.body,
      );

      if (!parsed.success) {
        res.status(400).json({
          message: "Invalid payment review data",
          errors: parsed.error.flatten(),
        });
        return;
      }

      const paymentRef = db.collection("payments").doc(paymentId);
      const newStatus = parsed.data.status;
      const now = new Date().toISOString();

      const outcome = await db.runTransaction(async (transaction) => {
        const paymentSnapshot = await transaction.get(paymentRef);
        const paymentData = paymentSnapshot.data();

        if (!paymentSnapshot.exists || paymentData?.hostelId !== hostelId) {
          return { error: "Payment proof not found", statusCode: 404 as const };
        }
        if (String(paymentData.status ?? "").toUpperCase() !== "SUBMITTED") {
          return { error: "This payment proof has already been reviewed", statusCode: 409 as const };
        }

        if (newStatus === "APPROVED") {
          const feeId = String(paymentData.feeId ?? "");
          if (!feeId) return { error: "Payment proof is missing fee information", statusCode: 400 as const };

          const feeRef = db.collection("fees").doc(feeId);
          const feeSnapshot = await transaction.get(feeRef);
          const feeData = feeSnapshot.data();
          if (!feeSnapshot.exists || feeData?.hostelId !== hostelId) {
            return { error: "Fee not found", statusCode: 404 as const };
          }

          const currentPaid = Number(feeData.paidAmount ?? 0);
          const feeAmount = Number(feeData.amount ?? 0);
          const paymentAmount = Number(paymentData.amount ?? 0);
          const remaining = feeAmount - currentPaid;
          if (paymentAmount > remaining) {
            return { error: "Payment proof amount exceeds the remaining fee", statusCode: 400 as const, remainingAmount: remaining };
          }

          const newPaidAmount = currentPaid + paymentAmount;
          const feeStatus = newPaidAmount >= feeAmount
            ? "PAID"
            : newPaidAmount > 0
              ? "PARTIALLY_PAID"
              : "PENDING";
          transaction.update(feeRef, { paidAmount: newPaidAmount, status: feeStatus, updatedAt: now });
        }

        transaction.update(paymentRef, {
          status: newStatus,
          reviewedBy: req.authUser!.id,
          reviewedAt: now,
          reviewNote: parsed.data.reviewNote ?? null,
          updatedAt: now,
        });
        return { paymentData };
      });

      if ("error" in outcome) {
        const errorOutcome = outcome as {
          error: string;
          statusCode: number;
          remainingAmount?: number;
        };
        res.status(errorOutcome.statusCode).json({
          message: errorOutcome.error,
          ...(errorOutcome.remainingAmount !== undefined && { remainingAmount: errorOutcome.remainingAmount }),
        });
        return;
      }

      await writeAuditLog({
        actorId: req.authUser.id,
        action: "REVIEW_PAYMENT_PROOF",
        entityType: "PAYMENT",
        entityId: paymentId,
        metadata: {
          hostelId,
          status: newStatus,
          reviewNote:
            parsed.data.reviewNote ?? null,
        },
      });

      const renterId = String(outcome.paymentData.renterId ?? "");
      const renterSnapshot = renterId
        ? await db.collection("renters").doc(renterId).get()
        : null;
      const renterUserId = String(renterSnapshot?.data()?.userId ?? "");
      if (renterUserId) {
        // notification logic removed
      }

      clearPaymentsCache(hostelId);

      res.json({
        message:
          newStatus === "APPROVED"
            ? "Payment proof approved"
            : "Payment proof rejected",
        payment: {
          id: paymentId,
          ...outcome.paymentData,
          status: newStatus,
          reviewedBy: req.authUser.id,
          reviewedAt: now,
          reviewNote: parsed.data.reviewNote ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// Delete payment proof or payment record (accessible via both /payments/:paymentId and /payment-proofs/:paymentId)
const deletePaymentHandler = async (
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
) => {
  try {
    const isSuperAdminOrAdmin =
      req.authUser?.role === "SUPER_ADMIN" ||
      req.authUser?.role === "ADMIN";
    const isRenter = req.authUser?.role === "RENTER";

    if (!isSuperAdminOrAdmin && !isRenter) {
      res.status(403).json({
        message: "You are not authorized to delete payment records",
      });
      return;
    }

    const hostelId = typeof req.params.hostelId === "string" ? req.params.hostelId : "";
    const paymentId = typeof req.params.paymentId === "string" ? req.params.paymentId : "";

    if (!hostelId || !paymentId) {
      res.status(400).json({ message: "Invalid ID parameters" });
      return;
    }

    const paymentRef = db.collection("payments").doc(paymentId);
    const paymentDoc = await paymentRef.get();

    if (!paymentDoc.exists || paymentDoc.data()?.hostelId !== hostelId) {
      res.status(404).json({ message: "Payment record not found" });
      return;
    }

    const paymentData = paymentDoc.data();
    const status = String(paymentData?.status || "").toUpperCase();
    const paymentAmount = Number(paymentData?.amount || 0);
    const feeId = String(paymentData?.feeId || "");

    // If RENTER: verify ownership and ensure not already approved
    if (isRenter) {
      const renterSnap = await db
        .collection("renters")
        .where("userId", "==", req.authUser!.id)
        .where("hostelId", "==", hostelId)
        .where("status", "==", "ACTIVE")
        .limit(1)
        .get();

      const renterDoc = renterSnap.docs[0];
      if (!renterDoc || renterDoc.id !== paymentData?.renterId) {
        res.status(403).json({ message: "You can only delete your own payment submissions" });
        return;
      }

      if (status === "APPROVED") {
        res.status(403).json({
          message: "Approved payment proofs cannot be deleted. Please contact your hostel administrator.",
        });
        return;
      }
    }

    // If this payment was APPROVED (by admin), adjust the fee back
    if (status === "APPROVED" && feeId && paymentAmount > 0) {
      const feeRef = db.collection("fees").doc(feeId);
      const feeDoc = await feeRef.get();
      if (feeDoc.exists) {
        const feeData = feeDoc.data();
        const currentPaid = Number(feeData?.paidAmount || 0);
        const totalFee = Number(feeData?.amount || 0);
        const newPaid = Math.max(0, currentPaid - paymentAmount);
        const newStatus =
          newPaid >= totalFee
            ? "PAID"
            : newPaid > 0
              ? "PARTIALLY_PAID"
              : "PENDING";
        await feeRef.update({
          paidAmount: newPaid,
          status: newStatus,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // Clean up any admin notifications created for this payment proof
    try {
      const notifSnap = await db
        .collection("notifications")
        .where("entityId", "==", paymentId)
        .get();
      const batch = db.batch();
      notifSnap.docs.forEach((d) => batch.delete(d.ref));
      if (!notifSnap.empty) {
        await batch.commit();
      }
    } catch {
      // non-fatal
    }

    await paymentRef.delete();

    await writeAuditLog({
      actorId: req.authUser!.id,
      action: "DELETE_PAYMENT",
      entityType: "PAYMENT",
      entityId: paymentId,
      metadata: {
        hostelId,
        feeId,
        amount: paymentAmount,
        renterId: paymentData?.renterId,
        role: req.authUser!.role,
      },
    });

    clearPaymentsCache(hostelId);

    res.json({
      message: "Payment record deleted successfully",
      paymentId,
    });
  } catch (error) {
    next(error);
  }
};

router.delete("/:hostelId/payments/:paymentId", requireAuth, requireHostelAccess, deletePaymentHandler);
router.delete("/:hostelId/payment-proofs/:paymentId", requireAuth, requireHostelAccess, deletePaymentHandler);

export default router;
