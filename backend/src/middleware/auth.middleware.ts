import type { NextFunction, Request, Response } from "express";

import { firebaseAuth, db } from "../config/firebase.js";
import { env } from "../config/env.js";
import type { AuthUser } from "../types/auth.js";

interface CachedAuth {
  firebaseUser: any;
  authUser: AuthUser;
  cachedAt: number;
}

const authCache = new Map<string, CachedAuth>();
const AUTH_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes TTL (Firebase ID tokens last 1 hr)
const MAX_AUTH_CACHE_SIZE = 10000; // Easily accommodates thousands of concurrent users
const inFlightTokenResolutions = new Map<string, Promise<{ authUser: AuthUser; firebaseUser: any } | null>>();

export function invalidateAuthCache(userId?: string) {
  if (userId) {
    for (const [token, entry] of authCache.entries()) {
      if (entry.authUser.id === userId || entry.firebaseUser.uid === userId) {
        authCache.delete(token);
      }
    }
  } else {
    authCache.clear();
  }
}

export async function resolveAuthUserFromToken(token: string): Promise<{ authUser: AuthUser; firebaseUser: any } | null> {
  // Fast path: in-memory cached authentication
  const cached = authCache.get(token);
  if (cached && Date.now() - cached.cachedAt < AUTH_CACHE_TTL_MS) {
    return { authUser: cached.authUser, firebaseUser: cached.firebaseUser };
  }

  // Deduplicate concurrent in-flight resolutions for the same token (e.g. parallel /auth/me and /hostels)
  const existingInFlight = inFlightTokenResolutions.get(token);
  if (existingInFlight) {
    return existingInFlight;
  }

  const resolvePromise = (async () => {
    try {
      const firebaseUser = await firebaseAuth.verifyIdToken(token);
      let userDocument = null;

    // 1. Direct O(1) document lookup by UID (fastest path: ~15ms)
    const directDoc = await db.collection("users").doc(firebaseUser.uid).get();
    if (directDoc.exists) {
      userDocument = directDoc;
    } else {
      // 2. Fallback query by firebaseUid
      const snapshot = await db
        .collection("users")
        .where("firebaseUid", "==", firebaseUser.uid)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        userDocument = snapshot.docs[0];
      } else if (firebaseUser.email) {
        const emailSnapshot = await db
          .collection("users")
          .where("email", "==", firebaseUser.email.toLowerCase())
          .limit(1)
          .get();

        if (!emailSnapshot.empty && emailSnapshot.docs[0]) {
          userDocument = emailSnapshot.docs[0];
          await userDocument.ref.update({
            firebaseUid: firebaseUser.uid,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    if (!userDocument && firebaseUser.email && env.BOOTSTRAP_ADMIN_EMAIL && firebaseUser.email.toLowerCase() === env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
      const newRef = db.collection("users").doc(firebaseUser.uid);
      const now = new Date().toISOString();
      const adminData = {
        id: firebaseUser.uid,
        firebaseUid: firebaseUser.uid,
        email: firebaseUser.email.toLowerCase(),
        firstName: "Abhilash",
        lastName: "Bannan",
        role: "SUPER_ADMIN" as const,
        status: "ACTIVE" as const,
        phone: null,
        profilePhotoUrl: null,
        createdAt: now,
        updatedAt: now,
      };
      await newRef.set(adminData);
      userDocument = {
        id: newRef.id,
        data: () => adminData,
      } as any;
    }

    if (!userDocument) {
      return null;
    }

    const authUser = {
      id: userDocument.id,
      ...(userDocument.data() as Omit<AuthUser, "id">),
    } as AuthUser;

    if (authCache.size >= MAX_AUTH_CACHE_SIZE) {
      const firstKey = authCache.keys().next().value;
      if (firstKey) authCache.delete(firstKey);
    }
    authCache.set(token, {
      firebaseUser,
      authUser,
      cachedAt: Date.now(),
    });

    return { authUser, firebaseUser };
    } catch (err) {
      console.error("TOKEN RESOLUTION ERROR:", err);
      return null;
    } finally {
      inFlightTokenResolutions.delete(token);
    }
  })();

  inFlightTokenResolutions.set(token, resolvePromise);
  return resolvePromise;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({
      message: "Missing Authorization header",
    });
    return;
  }

  const token = authorization.substring(7).trim();

  if (!token) {
    res.status(401).json({
      message: "Missing Firebase ID token",
    });
    return;
  }

  const resolved = await resolveAuthUserFromToken(token);
  if (!resolved) {
    res.status(401).json({
      message: "Invalid or expired Firebase ID token, or user profile not found",
    });
    return;
  }

  if (resolved.authUser.status !== "ACTIVE") {
    res.status(403).json({
      message: "User account is disabled",
    });
    return;
  }

  req.firebaseUser = resolved.firebaseUser;
  req.authUser = resolved.authUser;
  next();
}

export const authMiddleware = requireAuth;