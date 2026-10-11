import { db, messaging } from "../config/firebase.js";

async function main() {
  const snap = await db.collection("pushTokens").get();
  console.log("=== pushTokens in Firestore ===");
  console.log("Total:", snap.size);
  for (const doc of snap.docs) {
    const d = doc.data();
    console.log(`userId=${d.userId}  platform=${d.platform}  updatedAt=${d.updatedAt}`);
  }

  // cross-reference with users collection
  console.log("\n=== User vs Token map ===");
  const users = await db.collection("users").get();
  for (const u of users.docs) {
    const uid = u.id;
    const data = u.data();
    const tokens = snap.docs.filter((t) => t.data().userId === uid);
    const tokenStatus = tokens.length > 0 ? `${tokens.length} token(s)` : "NO TOKEN ❌";
    console.log(`${data.email} (${data.role}) → ${tokenStatus}`);
  }

  // Attempt to send a test notification to EVERY registered token
  console.log("\n=== Sending test FCM to all tokens ===");
  for (const doc of snap.docs) {
    const d = doc.data();
    const token = d.token as string;
    const isExpo = token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
    console.log(`Sending to userId=${d.userId} via ${isExpo ? "Expo API" : "Native FCM"}...`);
    try {
      if (isExpo) {
        const resp = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: token, title: "Test", body: "Background test notification", sound: "default" }),
        });
        const json = (await resp.json()) as any;
        console.log("  Expo response:", JSON.stringify(json?.data));
      } else {
        const msgId = await messaging.send({
          token,
          notification: { title: "Test Notification 🔔", body: "If you see this when app is closed, push works!" },
          data: {
            title: "Test Notification 🔔",
            message: "If you see this when app is closed, push works!",
            body: "If you see this when app is closed, push works!",
            channelId: "default",
          },
          android: {
            priority: "high",
            ttl: 86400 * 1000,
            notification: { channelId: "default", sound: "default", defaultSound: true, defaultVibrateTimings: true, priority: "max", visibility: "public" },
          },
        });
        console.log("  FCM SUCCESS:", msgId);
      }
    } catch (err: any) {
      const code = err?.code || "";
      const msg = err?.message || String(err);
      const dead = code.includes("UNREGISTERED") || code.includes("NOT_FOUND") || msg.includes("UNREGISTERED");
      console.log(`  FAILED (${dead ? "DEAD TOKEN ❌" : "error"}):`, msg.slice(0, 120));
    }
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
