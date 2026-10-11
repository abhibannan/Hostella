import { Router } from "express";
import { z } from "zod";
import { createHash } from "node:crypto";
import { db } from "../../config/firebase.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { isExpoPushToken, sendExpoPushNotifications } from "../../services/expo-push.service.js";

const router = Router();

const pushTokenSchema = z
  .object({
    token: z.string().min(1).optional(),
    pushToken: z.string().min(1).optional(),
    platform: z.enum(["ios", "android"]).optional(),
  })
  .refine((data) => Boolean(data.token || data.pushToken), {
    message: "Either token or pushToken is required",
  });

router.post("/push-token", requireAuth, async (req, res, next) => {
  try {
    const parsed = pushTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid push token payload" });
      return;
    }

    const token = (parsed.data.token || parsed.data.pushToken)!.trim();
    if (!isExpoPushToken(token)) {
      res.status(400).json({ message: "Invalid Expo push token" });
      return;
    }

    const tokenId = createHash("sha256").update(token).digest("hex");
    await db.collection("pushTokens").doc(tokenId).set({
      id: tokenId,
      userId: req.authUser!.id,
      token,
      platform: parsed.data.platform ?? null,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    res.status(200).json({ success: true, message: "Push token registered successfully" });
  } catch (error) {
    next(error);
  }
});

// Debug: Check if current user has a registered push token
router.get("/push-token-status", requireAuth, async (req, res, next) => {
  try {
    const snap = await db
      .collection("pushTokens")
      .where("userId", "==", req.authUser!.id)
      .get();
    res.status(200).json({
      userId: req.authUser!.id,
      tokenCount: snap.size,
      tokens: snap.docs.map((d) => ({
        id: d.id,
        platform: d.data().platform,
        updatedAt: d.data().updatedAt,
        tokenPrefix: String(d.data().token || "").slice(0, 20) + "...",
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Debug: Send a test push notification to the caller's own device
router.post("/push-token/test", requireAuth, async (req, res, next) => {
  try {
    const delay = Math.min(Math.max(Number(req.body?.delaySeconds || 0), 0), 30);
    const userId = req.authUser!.id;

    const sendPush = async () => {
      await sendExpoPushNotifications([
        {
          userId,
          title: "Hostella Push Alert 🔔",
          body: delay > 0
            ? `Push notification delivered successfully while app was closed (${delay}s delay)!`
            : "Push notification delivered successfully!",
          data: { type: "SYSTEM", test: "true" },
        },
      ]);
    };

    if (delay > 0) {
      setTimeout(() => {
        void sendPush().catch((err) => console.error("[TestPush] Delayed send failed:", err));
      }, delay * 1000);
      res.status(200).json({
        success: true,
        message: `Test push scheduled in ${delay} seconds. Close or lock your app now!`,
      });
    } else {
      await sendPush();
      res.status(200).json({ success: true, message: "Test push notification sent to your device." });
    }
  } catch (error) {
    next(error);
  }
});

const createNotificationSchema = z.object({
  userId: z.string().min(1),
  type: z.enum([
    "FEE_DUE",
    "FEE_OVERDUE",
    "PAYMENT_RECORDED",
    "REPAIR_CREATED",
    "REPAIR_UPDATED",
    "SYSTEM",
    "ANNOUNCEMENT",
  ]),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(1000),
  hostelId: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});

// Create notification
router.post(
  "/",
  requireAuth,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN"
      ) {
        res.status(403).json({
          message: "Only Admin can create notifications",
        });
        return;
      }

      const parsed =
        createNotificationSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          message: "Invalid notification data",
          errors: parsed.error.flatten(),
        });
        return;
      }

      const user = await db
        .collection("users")
        .doc(parsed.data.userId)
        .get();

      if (!user.exists) {
        res.status(404).json({
          message: "User not found",
        });
        return;
      }

      // Enforce hostel assignment for non-super admins
      if (req.authUser.role === "ADMIN") {
        const adminHostelsSnap = await db
          .collection("hostelAdmins")
          .where("adminId", "==", req.authUser.id)
          .get();
        const managedHostelIds = adminHostelsSnap.docs.map((d) => d.id);

        const targetRenterSnap = await db
          .collection("renters")
          .where("userId", "==", parsed.data.userId)
          .get();
        const targetHostelIds = targetRenterSnap.docs.map((d) => d.data().hostelId);

        const hasAccess =
          (parsed.data.hostelId && managedHostelIds.includes(parsed.data.hostelId)) ||
          targetHostelIds.some((hId) => managedHostelIds.includes(hId));

        if (!hasAccess && managedHostelIds.length > 0) {
          res.status(403).json({
            message: "You can only send notifications to tenants of hostels you manage",
          });
          return;
        }
      }

      const notificationRef = db
        .collection("notifications")
        .doc();

      const now = new Date().toISOString();

      const notification = {
        id: notificationRef.id,
        userId: parsed.data.userId,
        type: parsed.data.type,
        title: parsed.data.title,
        message: parsed.data.message,
        hostelId: parsed.data.hostelId ?? null,
        entityType:
          parsed.data.entityType ?? null,
        entityId: parsed.data.entityId ?? null,
        senderId: req.authUser!.id,
        createdBy: req.authUser!.id,
        read: false,
        createdAt: now,
        readAt: null,
      };

      await notificationRef.set(notification);

      if (parsed.data.userId !== req.authUser!.id) {
        await sendExpoPushNotifications([
          {
            userId: parsed.data.userId,
            title: parsed.data.title,
            body: parsed.data.message,
            data: { notificationId: notificationRef.id, type: parsed.data.type },
          },
        ]);
      }

      res.status(201).json({
        message: "Notification created successfully",
        notification,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Get current user's notifications (both targeted and broadcasts)
router.get(
  "/me",
  requireAuth,
  async (req, res, next) => {
    try {
      const [personalSnapshot, broadcastSnapshot] = await Promise.all([
        db.collection("notifications").where("userId", "==", req.authUser!.id).get(),
        db.collection("notifications").where("userId", "==", "ALL").get(),
      ]);

      type NotificationItem = {
        id: string;
        userId: string;
        type: string;
        title: string;
        message: string;
        hostelId: string | null;
        entityType: string | null;
        entityId: string | null;
        senderId?: string | null;
        createdBy?: string | null;
        sentByMe?: boolean;
        read: boolean;
        createdAt: string;
        readAt: string | null;
      };

      let userHostelIds: string[] = [];
      if (req.authUser?.role === "RENTER") {
        const renterSnap = await db
          .collection("renters")
          .where("userId", "==", req.authUser.id)
          .where("status", "==", "ACTIVE")
          .get();
        userHostelIds = renterSnap.docs
          .map((d) => d.data().hostelId)
          .filter(Boolean);
      }

      const seenIds = new Set<string>();
      const allDocs = [...personalSnapshot.docs, ...broadcastSnapshot.docs].filter((doc) => {
        if (seenIds.has(doc.id)) return false;
        seenIds.add(doc.id);
        const data = doc.data();
        if (Array.isArray(data.dismissedBy) && data.dismissedBy.includes(req.authUser!.id)) {
          return false;
        }

        // Never deliver a personal notification back to the user who sent it
        if (
          data.userId === req.authUser!.id &&
          (data.senderId === req.authUser!.id || data.createdBy === req.authUser!.id)
        ) {
          return false;
        }

        // Scope broadcasts to resident's hostel
        if (
          req.authUser?.role === "RENTER" &&
          userHostelIds.length > 0 &&
          data.hostelId &&
          data.hostelId !== "ALL" &&
          !userHostelIds.includes(data.hostelId)
        ) {
          return false;
        }
        return true;
      });

      // Automatic cleanup: Check if any repair notifications belong to resolved/deleted repairs
      const repairNotifs = allDocs.filter(
        (doc) =>
          doc.data().entityType === "REPAIR" &&
          doc.data().entityId,
      );

      const resolvedRepairIds = new Set<string>();
      if (repairNotifs.length > 0) {
        const repairIds = [
          ...new Set(repairNotifs.map((d) => String(d.data().entityId))),
        ];
        await Promise.all(
          repairIds.map(async (rId) => {
            try {
              const rDoc = await db.collection("repairs").doc(rId).get();
              if (!rDoc.exists || String(rDoc.data()?.status).toUpperCase() === "RESOLVED") {
                resolvedRepairIds.add(rId);
              }
            } catch {
              // ignore
            }
          }),
        );
      }

      // Filter out and delete notifications for resolved/deleted repairs
      const activeDocs: typeof allDocs = [];
      const staleDocsToDelete: typeof allDocs = [];

      for (const doc of allDocs) {
        const d = doc.data();
        if (d.entityType === "REPAIR" && d.entityId && resolvedRepairIds.has(String(d.entityId))) {
          staleDocsToDelete.push(doc);
        } else {
          activeDocs.push(doc);
        }
      }

      if (staleDocsToDelete.length > 0) {
        const batch = db.batch();
        staleDocsToDelete.forEach((d) => batch.delete(d.ref));
        batch.commit().catch(() => {});
      }

      const notifications: NotificationItem[] = activeDocs.map((doc) => {
        const data = doc.data();
        const isSentByMe = Boolean(
          (data.senderId && data.senderId === req.authUser!.id) ||
          (data.createdBy && data.createdBy === req.authUser!.id)
        );

        return {
          id: doc.id,
          userId: String(data.userId ?? ""),
          type: String(data.type ?? ""),
          title: String(data.title ?? ""),
          message: String(data.message ?? ""),
          hostelId:
            data.hostelId == null
              ? null
              : String(data.hostelId),
          entityType:
            data.entityType == null
              ? null
              : String(data.entityType),
          entityId:
            data.entityId == null
              ? null
              : String(data.entityId),
          senderId: data.senderId ? String(data.senderId) : null,
          createdBy: data.createdBy ? String(data.createdBy) : null,
          sentByMe: isSentByMe,
          read: Boolean(data.read),
          createdAt: String(
            data.createdAt ?? "",
          ),
          readAt:
            data.readAt == null
              ? null
              : String(data.readAt),
        };
      });

      notifications.sort((a, b) =>
        b.createdAt.localeCompare(
          a.createdAt,
        ),
      );

      res.json({ notifications });
    } catch (error) {
      next(error);
    }
  },
);

// Get unread count
router.get(
  "/me/unread-count",
  requireAuth,
  async (req, res, next) => {
    try {
      const snapshot = await db
        .collection("notifications")
        .where(
          "userId",
          "==",
          req.authUser!.id,
        )
        .where("read", "==", false)
        .get();

      res.json({
        unreadCount: snapshot.size,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Mark notification as read
router.patch(
  "/:notificationId/read",
  requireAuth,
  async (req, res, next) => {
    try {
      const notificationId =
        req.params.notificationId;

      if (
        typeof notificationId !== "string"
      ) {
        res.status(400).json({
          message: "Invalid notification ID",
        });
        return;
      }

      const notificationRef = db
        .collection("notifications")
        .doc(notificationId);

      const notification =
        await notificationRef.get();

      if (!notification.exists) {
        res.status(404).json({
          message: "Notification not found",
        });
        return;
      }

      if (
        notification.data()?.userId !==
        req.authUser!.id
      ) {
        res.status(403).json({
          message: "Access denied",
        });
        return;
      }

      const now = new Date().toISOString();

      await notificationRef.update({
        read: true,
        readAt: now,
      });

      res.json({
        message:
          "Notification marked as read",
      });
    } catch (error) {
      next(error);
    }
  },
);

// Mark all notifications as read
router.patch(
  "/me/read-all",
  requireAuth,
  async (req, res, next) => {
    try {
      const snapshot = await db
        .collection("notifications")
        .where(
          "userId",
          "==",
          req.authUser!.id,
        )
        .where("read", "==", false)
        .get();

      if (snapshot.empty) {
        res.json({
          message:
            "No unread notifications",
        });
        return;
      }

      const batch = db.batch();
      const now = new Date().toISOString();

      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          read: true,
          readAt: now,
        });
      });

      await batch.commit();

      res.json({
        message:
          "All notifications marked as read",
        count: snapshot.size,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Delete / Clear all notifications for current user
router.delete(
  "/me/clear-all",
  requireAuth,
  async (req, res, next) => {
    try {
      const isAdmin = req.authUser?.role === "ADMIN" || req.authUser?.role === "SUPER_ADMIN";
      const hostelId = typeof req.query.hostelId === "string" ? req.query.hostelId : null;

      if (isAdmin && hostelId) {
        const [hostelAnnouncements, allAnnouncements] = await Promise.all([
          db.collection("notifications").where("hostelId", "==", hostelId).where("entityType", "==", "BROADCAST").get(),
          db.collection("notifications").where("hostelId", "==", hostelId).where("userId", "==", "ALL").get(),
        ]);
        const seen = new Set<string>();
        const batch = db.batch();
        let cleared = 0;
        for (const snap of [hostelAnnouncements, allAnnouncements]) {
          for (const doc of snap.docs) {
            if (!seen.has(doc.id)) {
              seen.add(doc.id);
              batch.delete(doc.ref);
              cleared++;
            }
          }
        }
        if (cleared > 0) await batch.commit();
        res.json({ message: "Hostel announcements cleared successfully", count: cleared });
        return;
      }

      const [personalSnapshot, broadcastSnapshot] = await Promise.all([
        db.collection("notifications").where("userId", "==", req.authUser!.id).get(),
        db.collection("notifications").where("userId", "==", "ALL").get(),
      ]);

      const batch = db.batch();
      let clearedCount = 0;

      // Delete personal notifications
      personalSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        clearedCount++;
      });

      // Dismiss broadcast notifications for this user
      broadcastSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const dismissedBy = Array.isArray(data.dismissedBy) ? [...data.dismissedBy] : [];
        if (!dismissedBy.includes(req.authUser!.id)) {
          dismissedBy.push(req.authUser!.id);
          batch.update(doc.ref, { dismissedBy });
          clearedCount++;
        }
      });

      if (clearedCount > 0) {
        await batch.commit();
      }

      res.json({
        message: "All notifications cleared successfully",
        count: clearedCount,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Delete single notification
router.delete(
  "/:notificationId",
  requireAuth,
  async (req, res, next) => {
    try {
      const notificationId = req.params.notificationId;
      if (typeof notificationId !== "string") {
        res.status(400).json({ message: "Invalid notification ID" });
        return;
      }

      const notifRef = db.collection("notifications").doc(notificationId);
      const notifDoc = await notifRef.get();

      if (!notifDoc.exists) {
        res.status(404).json({ message: "Notification not found" });
        return;
      }

      const notifData = notifDoc.data();
      const isOwner = notifData?.userId === req.authUser!.id;
      const isAdmin = req.authUser?.role === "ADMIN" || req.authUser?.role === "SUPER_ADMIN";

      if (notifData?.userId === "ALL" || notifData?.entityType === "BROADCAST") {
        if (isAdmin) {
          const delBatch = db.batch();
          delBatch.delete(notifRef);
          // Also clean up any duplicate docs created with identical title, message & hostelId
          if (notifData.title && notifData.message) {
            const dupsSnap = await db
              .collection("notifications")
              .where("title", "==", notifData.title)
              .where("message", "==", notifData.message)
              .get();
            dupsSnap.docs.forEach((d) => delBatch.delete(d.ref));
          }
          await delBatch.commit();
          res.json({ message: "Announcement deleted successfully", notificationId });
          return;
        }
        // Dismiss broadcast notification for this renter
        const dismissedBy = Array.isArray(notifData?.dismissedBy) ? [...notifData.dismissedBy] : [];
        if (!dismissedBy.includes(req.authUser!.id)) {
          dismissedBy.push(req.authUser!.id);
          await notifRef.update({ dismissedBy });
        }
        res.json({ message: "Notification dismissed successfully", notificationId });
        return;
      }

      if (!isOwner && !isAdmin) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      await notifRef.delete();

      res.json({
        message: "Notification deleted successfully",
        notificationId,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Broadcast notification to all active residents in a hostel or all hostels
router.post(
  "/broadcast",
  requireAuth,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN"
      ) {
        res.status(403).json({ message: "Only Admin can send broadcasts" });
        return;
      }

      const { hostelId, title, message, type } = req.body;

      if (!title || !message) {
        res.status(400).json({ message: "Title and message are required" });
        return;
      }

      const batch = db.batch();
      const now = new Date().toISOString();

      // Always create the master broadcast announcement for the hostel/global feed
      const broadcastMasterRef = db.collection("notifications").doc();
      batch.set(broadcastMasterRef, {
        id: broadcastMasterRef.id,
        userId: "ALL",
        type: type || "ANNOUNCEMENT",
        title: String(title).trim(),
        message: String(message).trim(),
        hostelId: hostelId && hostelId !== "ALL" ? hostelId : "ALL",
        entityType: "BROADCAST",
        entityId: null,
        senderId: req.authUser!.id,
        createdBy: req.authUser!.id,
        read: false,
        readAt: null,
        createdAt: now,
      });

      let rentersQuery: FirebaseFirestore.Query = db
        .collection("renters")
        .where("status", "==", "ACTIVE");

      if (hostelId && hostelId !== "ALL") {
        rentersQuery = rentersQuery.where("hostelId", "==", hostelId);
      }

      const rentersSnapshot = await rentersQuery.get();
      let sentCount = 0;
      const seenUserIds = new Set<string>();

      for (const renterDoc of rentersSnapshot.docs) {
        const renter = renterDoc.data();
        const userId = renter.userId;
        if (!userId || seenUserIds.has(userId)) continue;
        // The sender/admin must NOT receive push notifications for their own broadcast
        if (userId === req.authUser!.id) continue;
        seenUserIds.add(userId);
        sentCount++;
      }

      await batch.commit();

      await sendExpoPushNotifications(
        [...seenUserIds].map((userId) => ({
          userId,
          title: String(title).trim(),
          body: String(message).trim(),
          data: { type: String(type || "ANNOUNCEMENT"), entityType: "BROADCAST" },
        })),
      );

      res.status(201).json({
        message:
          sentCount > 0
            ? `Broadcast published and sent to ${sentCount} resident${sentCount === 1 ? "" : "s"} successfully`
            : "Broadcast announcement published successfully to hostel bulletin",
        count: sentCount,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Send targeted fee reminder for a specific fee
router.post(
  "/remind-fee",
  requireAuth,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN"
      ) {
        res.status(403).json({ message: "Only Admin can send fee reminders" });
        return;
      }

      const { feeId, customMessage } = req.body;

      if (!feeId) {
        res.status(400).json({ message: "feeId is required" });
        return;
      }

      const feeDoc = await db.collection("fees").doc(feeId).get();
      if (!feeDoc.exists) {
        res.status(404).json({ message: "Fee not found" });
        return;
      }

      const fee = feeDoc.data()!;
      const renterDoc = await db.collection("renters").doc(fee.renterId).get();
      if (!renterDoc.exists) {
        res.status(404).json({ message: "Renter not found" });
        return;
      }

      const renter = renterDoc.data()!;
      const remainingAmount = Number(fee.amount || 0) - Number(fee.paidAmount || 0);
      const isOverdue = fee.status === "OVERDUE" || (fee.dueDate && new Date().toISOString().slice(0, 10) > fee.dueDate);

      const notifRef = db.collection("notifications").doc();
      const now = new Date().toISOString();

      await notifRef.set({
        id: notifRef.id,
        userId: renter.userId,
        type: isOverdue ? "FEE_OVERDUE" : "FEE_DUE",
        title: isOverdue ? `Overdue Fee Reminder: ₹${remainingAmount}` : `Rent Fee Reminder: ₹${remainingAmount}`,
        message: customMessage || `Notice from Hostel Admin: Your fee of ₹${remainingAmount} for ${fee.month} is ${isOverdue ? 'overdue' : 'pending'}. Due date: ${fee.dueDate}. Please clear your payment promptly.`,
        hostelId: fee.hostelId || null,
        entityType: "FEE",
        entityId: feeId,
        senderId: req.authUser!.id,
        createdBy: req.authUser!.id,
        read: false,
        readAt: null,
        createdAt: now,
      });

      if (String(renter.userId) !== req.authUser!.id) {
        await sendExpoPushNotifications([
          {
            userId: String(renter.userId),
            title: isOverdue ? `Overdue Fee Reminder: ₹${remainingAmount}` : `Rent Fee Reminder: ₹${remainingAmount}`,
            body: customMessage || `Notice from Hostel Admin: Your fee of ₹${remainingAmount} for ${fee.month} is ${isOverdue ? "overdue" : "pending"}. Due date: ${fee.dueDate}. Please clear your payment promptly.`,
            data: { type: isOverdue ? "FEE_OVERDUE" : "FEE_DUE", entityType: "FEE", entityId: String(feeId) },
          },
        ]);
      }

      res.status(201).json({
        message: "Fee reminder sent successfully to the renter",
      });
    } catch (error) {
      next(error);
    }
  },
);

// Send fee reminder to all unpaid renters in a hostel
router.post(
  "/remind-all-unpaid",
  requireAuth,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN"
      ) {
        res.status(403).json({ message: "Only Admin can send fee reminders" });
        return;
      }

      const { hostelId } = req.body;

      let feesQuery: FirebaseFirestore.Query = db
        .collection("fees")
        .where("status", "in", ["PENDING", "OVERDUE", "PARTIALLY_PAID"]);

      if (hostelId && hostelId !== "ALL") {
        feesQuery = feesQuery.where("hostelId", "==", hostelId);
      }

      const feesSnapshot = await feesQuery.get();

      if (feesSnapshot.empty) {
        res.json({ message: "No unpaid or overdue fees found", count: 0 });
        return;
      }

      const batch = db.batch();
      const now = new Date().toISOString();
      let sentCount = 0;
      const renterUserMap = new Map<string, string>();
      const pushMessages: Array<{ userId: string; title: string; body: string; data?: Record<string, string> }> = [];

      for (const feeDoc of feesSnapshot.docs) {
        const fee = feeDoc.data();
        if (!fee.renterId) continue;

        let userId = renterUserMap.get(fee.renterId);
        if (!userId) {
          const renterDoc = await db.collection("renters").doc(fee.renterId).get();
          if (renterDoc.exists) {
            userId = renterDoc.data()?.userId;
            if (userId) renterUserMap.set(fee.renterId, userId);
          }
        }

        // Never send reminder to the admin user who created it
        if (!userId || userId === req.authUser!.id) continue;

        const remainingAmount = Number(fee.amount || 0) - Number(fee.paidAmount || 0);
        const isOverdue = fee.status === "OVERDUE" || (fee.dueDate && new Date().toISOString().slice(0, 10) > fee.dueDate);

        const notifRef = db.collection("notifications").doc();
        batch.set(notifRef, {
          id: notifRef.id,
          userId,
          type: isOverdue ? "FEE_OVERDUE" : "FEE_DUE",
          title: isOverdue ? `Overdue Rent Reminder: ₹${remainingAmount}` : `Fee Payment Reminder: ₹${remainingAmount}`,
          message: `Notice from Hostel Admin: Your fee of ₹${remainingAmount} for ${fee.month} is ${isOverdue ? 'overdue' : 'pending'}. Due date: ${fee.dueDate}. Please clear your dues.`,
          hostelId: fee.hostelId || null,
          entityType: "FEE",
          entityId: feeDoc.id,
          senderId: req.authUser!.id,
          createdBy: req.authUser!.id,
          read: false,
          readAt: null,
          createdAt: now,
        });
        sentCount++;

        pushMessages.push({
          userId,
          title: isOverdue ? `Overdue Rent Reminder: ₹${remainingAmount}` : `Fee Payment Reminder: ₹${remainingAmount}`,
          body: `Notice from Hostel Admin: Your fee of ₹${remainingAmount} for ${fee.month} is ${isOverdue ? 'overdue' : 'pending'}. Due date: ${fee.dueDate}. Please clear your dues.`,
          data: { type: isOverdue ? "FEE_OVERDUE" : "FEE_DUE", entityType: "FEE", entityId: String(feeDoc.id) },
        });
      }

      if (sentCount > 0) {
        await batch.commit();
        await sendExpoPushNotifications(pushMessages);
      }

      res.status(201).json({
        message: `Reminders sent to ${sentCount} unpaid fee record${sentCount === 1 ? "" : "s"} successfully`,
        count: sentCount,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
