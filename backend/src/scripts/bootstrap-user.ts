import { FieldValue } from "firebase-admin/firestore";
import { firebaseAuth, db } from "../config/firebase.js";

async function createAdmin() {
const email = "hosteldesk.admin@gmail.com";

  const firebaseUser = await firebaseAuth.getUserByEmail(email);

  const existing = await db
    .collection("users")
    .where("firebaseUid", "==", firebaseUser.uid)
    .limit(1)
    .get();

  if (!existing.empty) {
    console.log("Hostella profile already exists.");
    console.log("Firebase UID:", firebaseUser.uid);
    return;
  }

  const userRef = db.collection("users").doc();

  await userRef.set({
    firebaseUid: firebaseUser.uid,
    email,
    firstName: "Admin",
    lastName: "User",
    phone: null,
    profilePhotoUrl: null,
    role: "ADMIN",
    status: "ACTIVE",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log("ADMIN profile created successfully.");
  console.log("Hostella user ID:", userRef.id);
  console.log("Firebase UID:", firebaseUser.uid);
}

createAdmin().catch((error) => {
  console.error("CREATE ADMIN ERROR:", error);
  process.exit(1);
});
