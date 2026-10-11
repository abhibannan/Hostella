import { db, messaging } from "../config/firebase.js";

type PushMessage = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

type PushTokenRecord = {
  token: string;
  userId: string;
};

// Validates both Expo Push Tokens and native FCM device tokens
export function isExpoPushToken(value: string): boolean {
  return typeof value === "string" && value.trim().length > 20;
}

/**
 * Sends notification via Expo Push API for ExponentPushToken[...] tokens
 */
async function sendExpoPushNotification(
  token: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<{ success: boolean; error?: string; dead?: boolean }> {
  try {
    const stringData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
    );
    const resp = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: "default",
        channelId: "default",
        priority: "high",
        data: stringData,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { success: false, error: text };
    }

    const json = (await resp.json()) as any;
    const ticket = json?.data;
    if (ticket && Array.isArray(ticket) ? ticket[0]?.status === "error" : ticket?.status === "error") {
      const errInfo = Array.isArray(ticket) ? ticket[0] : ticket;
      const isDead = errInfo?.details?.error === "DeviceNotRegistered";
      return { success: false, error: errInfo?.message || "Expo delivery failed", dead: isDead };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Sends notification via Google Firebase Admin Messaging for native FCM device tokens
 */
async function sendNativeFcm(
  token: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<{ success: boolean; error?: string; dead?: boolean }> {
  try {
    const stringData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
    );
    // Explicitly add title, message, and channelId to data payload
    // so ExpoFirebaseMessagingService can present notifications when app is closed/killed
    stringData.title = title;
    stringData.message = body;
    stringData.channelId = "default";

    await messaging.send({
      token,
      notification: { title, body },
      data: stringData,
      android: {
        priority: "high",
        ttl: 86400 * 1000,
        notification: {
          channelId: "default",
          sound: "default",
          defaultSound: true,
          defaultVibrateTimings: true,
          priority: "max",
          visibility: "public",
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
          "apns-push-type": "alert",
        },
        payload: {
          aps: {
            alert: { title, body },
            sound: "default",
            badge: 1,
            contentAvailable: true,
          },
        },
      },
    });

    return { success: true };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    const code = err?.code;
    const isDead =
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token" ||
      errMsg.includes("UNREGISTERED") ||
      errMsg.includes("NOT_FOUND") ||
      errMsg.includes("NotRegistered") ||
      errMsg.includes("SenderId mismatch");
    return { success: false, error: errMsg, dead: isDead };
  }
}

export async function sendExpoPushNotifications(
  messages: PushMessage[],
): Promise<void> {
  if (!messages.length) return;

  const messageByUser = new Map(messages.map((message) => [message.userId, message]));
  const userIds = [...messageByUser.keys()];
  const tokens: PushTokenRecord[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < userIds.length; i += 10) {
    const snap = await db
      .collection("pushTokens")
      .where("userId", "in", userIds.slice(i, i + 10))
      .get();
    for (const doc of snap.docs) {
      const d = doc.data();
      const token = String(d.token ?? "");
      const userId = String(d.userId ?? "");
      if (messageByUser.has(userId) && token.length > 20 && !seen.has(token)) {
        seen.add(token);
        tokens.push({ token, userId });
      }
    }
  }

  if (!tokens.length) {
    console.log("[Push] No registered push tokens found for users:", userIds);
    return;
  }

  const deadTokens: string[] = [];
  await Promise.all(
    tokens.map(async ({ token, userId }) => {
      const msg = messageByUser.get(userId)!;
      const isExpoToken =
        token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");

      const result = isExpoToken
        ? await sendExpoPushNotification(token, msg.title, msg.body, msg.data ?? {})
        : await sendNativeFcm(token, msg.title, msg.body, msg.data ?? {});

      if (!result.success) {
        console.error(`[Push] Failed → ${userId}: ${result.error}`);
        if (result.dead) {
          deadTokens.push(token);
        }
      } else {
        console.log(
          `[Push] Delivered → ${userId} ✓ (${isExpoToken ? "Expo Push SDK" : "Native FCM V1"})`,
        );
      }
    }),
  );

  for (const dead of deadTokens) {
    db.collection("pushTokens")
      .where("token", "==", dead)
      .get()
      .then((s) => s.docs.forEach((d) => d.ref.delete()))
      .catch(() => {});
  }
}
