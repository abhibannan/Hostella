import type { NextFunction, Request, Response } from "express";
import { db } from "../config/firebase.js";

interface CacheEntry {
  granted: boolean;
  timestamp: number;
}

const accessCache = new Map<string, CacheEntry>();
const ACCESS_CACHE_TTL_MS = 30 * 1000; // 30 seconds TTL

export function invalidateHostelAccessCache(hostelId?: string, userId?: string) {
  if (hostelId || userId) {
    for (const key of accessCache.keys()) {
      if ((hostelId && key.includes(hostelId)) || (userId && key.includes(userId))) {
        accessCache.delete(key);
      }
    }
  } else {
    accessCache.clear();
  }
}

export async function requireHostelAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.authUser) {
      res.status(401).json({ message: "Hostella user profile required" });
      return;
    }

    const hostelId = req.params.hostelId;

    if (typeof hostelId !== "string" || !hostelId.trim()) {
      res.status(400).json({ message: "Invalid hostel ID" });
      return;
    }

    const cacheKey = `${req.authUser.id}_${req.authUser.role}_${hostelId}`;
    const cached = accessCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ACCESS_CACHE_TTL_MS && cached.granted) {
      next();
      return;
    }

    // SUPER ADMIN
    // Super Admin has platform-wide oversight to manage staff & property assignments
    if (req.authUser.role === "SUPER_ADMIN") {
      next();
      return;
    }

    // ADMIN (Hostel Administrator)
    // Multi-admin boundary: Each admin has their own data.
    if (req.authUser.role === "ADMIN") {
      const hostelSnapshot = await db
        .collection("hostels")
        .doc(hostelId)
        .get();

      if (!hostelSnapshot.exists) {
        res.status(404).json({ message: "Hostel not found" });
        return;
      }

      const hostelData = hostelSnapshot.data() || {};
      const isOwner = hostelData.ownerId === req.authUser.id;

      if (!isOwner) {
        // Check if assigned in hostelAdmins collection
        const assignmentSnap = await db
          .collection("hostelAdmins")
          .where("adminId", "==", req.authUser.id)
          .where("hostelId", "==", hostelId)
          .limit(1)
          .get();

        if (assignmentSnap.empty) {
          res.status(403).json({
            message: "You do not have administrative access to this hostel.",
          });
          return;
        }
      }

      accessCache.set(cacheKey, { granted: true, timestamp: Date.now() });
      next();
      return;
    }

    // PARTNER
    // Partners can access ONLY the specific hostel they were added to
    if (req.authUser.role === "PARTNER") {
      const partnerSnap = await db
        .collection("hostelPartners")
        .where("userId", "==", req.authUser.id)
        .where("hostelId", "==", hostelId)
        .where("status", "==", "ACTIVE")
        .limit(1)
        .get();

      const hasDirectAssignment = !partnerSnap.empty;
      const hasHostelIdInProfile = Array.isArray(req.authUser.hostelIds) && req.authUser.hostelIds.includes(hostelId);

      if (!hasDirectAssignment && !hasHostelIdInProfile) {
        res.status(403).json({
          message: "You do not have access to this hostel as a partner.",
        });
        return;
      }

      accessCache.set(cacheKey, { granted: true, timestamp: Date.now() });
      next();
      return;
    }

    // RENTER
    // Can access only their currently active hostel.
    if (req.authUser.role === "RENTER") {
      const renterSnapshot = await db
        .collection("renters")
        .where("userId", "==", req.authUser.id)
        .where("hostelId", "==", hostelId)
        .where("status", "==", "ACTIVE")
        .limit(1)
        .get();

      if (renterSnapshot.empty) {
        res.status(403).json({
          message: "You do not have access to this hostel",
        });
        return;
      }

      accessCache.set(cacheKey, { granted: true, timestamp: Date.now() });
      next();
      return;
    }

    // REPAIR_PERSON
    // Technicians are common across all hostels in the portfolio
    if (req.authUser.role === "REPAIR_PERSON") {
      accessCache.set(cacheKey, { granted: true, timestamp: Date.now() });
      next();
      return;
    }

    res.status(403).json({
      message: "Invalid user role",
    });
  } catch (error) {
    next(error);
  }
}