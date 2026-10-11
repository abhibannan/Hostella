import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getMessaging } from "firebase-admin/messaging";

import { env } from "./env.js";

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
        ...(env.FIREBASE_STORAGE_BUCKET
          ? { storageBucket: env.FIREBASE_STORAGE_BUCKET }
          : {}),
      });

if (!app) {
  throw new Error("Firebase Admin app failed to initialize");
}

export const firebaseAuth = getAuth(app);

export const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

const bucketName = env.FIREBASE_STORAGE_BUCKET || `${env.FIREBASE_PROJECT_ID}.appspot.com`;
export const storage = getStorage(app).bucket(bucketName);

export const messaging = getMessaging(app);
