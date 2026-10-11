import { FieldValue } from "firebase-admin/firestore";
import { db } from "../../config/firebase.js";
import { sendExpoPushNotifications } from "../../services/expo-push.service.js";

export type NotificationType =
  | "FEE_DUE"
  | "FEE_OVERDUE"
  | "PAYMENT_RECORDED"
  | "REPAIR_CREATED"
  | "REPAIR_UPDATED"
  | "SYSTEM"
  | "ANNOUNCEMENT";

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  hostelId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  senderId?: string | null;
}

export async function createNotification(
  input: CreateNotificationInput,
) {
  const userSnapshot = await db
    .collection("users")
    .doc(input.userId)
    .get();

  if (!userSnapshot.exists) {
    throw new Error("Notification user not found");
  }

  const notificationRef = db
    .collection("notifications")
    .doc();

  const notification = {
    id: notificationRef.id,
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    hostelId: input.hostelId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    senderId: input.senderId ?? null,
    createdBy: input.senderId ?? null,
    read: false,
    readAt: null,
    createdAt: FieldValue.serverTimestamp(),
  };

  await notificationRef.set(notification);

  if (!input.senderId || input.senderId !== input.userId) {
    await sendExpoPushNotifications([
      {
        userId: input.userId,
        title: input.title,
        body: input.message,
        data: {
          notificationId: notificationRef.id,
          type: input.type,
          entityType: input.entityType ?? "",
          entityId: input.entityId ?? "",
        },
      },
    ]);
  }

 return {
  ...notification,
};
}
