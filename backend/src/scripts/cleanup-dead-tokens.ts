/**
 * cleanup-dead-tokens.ts
 * 
 * One-time script to remove stale / dead push tokens from Firestore.
 * Run with: npx tsx src/scripts/cleanup-dead-tokens.ts
 */
import { db, messaging } from "../config/firebase.js";

async function main() {
  const snap = await db.collection("pushTokens").get();
  console.log(`Checking ${snap.size} tokens...`);

  const toDelete: string[] = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    const token = String(d.token ?? "");
    const isExpo = token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");

    if (isExpo) {
      console.log(`SKIP (Expo token) userId=${d.userId}`);
      continue;
    }

    try {
      await messaging.send({
        token,
        data: { _probe: "1" },
      });
      console.log(`ALIVE ✓ userId=${d.userId}`);
    } catch (err: any) {
      const msg = err?.message || String(err);
      const isDead =
        msg.includes("UNREGISTERED") ||
        msg.includes("NOT_FOUND") ||
        msg.includes("NotRegistered") ||
        msg.includes("SenderId mismatch") ||
        msg.includes("invalid-registration-token");

      if (isDead) {
        console.log(`DEAD ❌ userId=${d.userId} — scheduling deletion`);
        toDelete.push(doc.id);
      } else {
        console.log(`UNKNOWN error for userId=${d.userId}:`, msg.slice(0, 80));
      }
    }
  }

  if (toDelete.length > 0) {
    const batch = db.batch();
    for (const id of toDelete) {
      batch.delete(db.collection("pushTokens").doc(id));
    }
    await batch.commit();
    console.log(`\nDeleted ${toDelete.length} dead token(s) from Firestore.`);
  } else {
    console.log("\nNo dead tokens found.");
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
