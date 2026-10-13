import { Router } from "express";
import { z } from "zod";
import { db } from "../../config/firebase.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireHostelAccess } from "../../middleware/hostel-access.middleware.js";
import { writeAuditLog } from "../../utils/audit.js";
import { registerCacheInvalidator, invalidateHostelCaches } from "../../utils/cache.js";

const router = Router();

interface CacheItem<T> {
  data: T;
  timestamp: number;
}
const roomsCache = new Map<string, CacheItem<any[]>>();
const ROOMS_CACHE_TTL_MS = 30000;

export function invalidateRoomsCache(hostelId?: string) {
  if (hostelId) {
    roomsCache.delete(hostelId);
  } else {
    roomsCache.clear();
  }
}
registerCacheInvalidator(invalidateRoomsCache);

const roomSchema = z.object({
  roomNumber: z.string().trim().min(1).max(50),
  floor: z.string().trim().max(50).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  maxOccupants: z.number().int().min(1).max(50).optional(),
});

const updateRoomSchema = roomSchema.partial();

// Create room
router.post(
  "/:hostelId/rooms",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN" &&
        req.authUser?.role !== "PARTNER"
      ) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const hostelId = req.params.hostelId;

      if (typeof hostelId !== "string") {
        res.status(400).json({ message: "Invalid hostel ID" });
        return;
      }

      const parsed = roomSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          message: "Invalid room data",
          errors: parsed.error.flatten(),
        });
        return;
      }

      const hostelRef = db.collection("hostels").doc(hostelId);
      const hostel = await hostelRef.get();

      if (!hostel.exists) {
        res.status(404).json({ message: "Hostel not found" });
        return;
      }

      const existing = await db
        .collection("rooms")
        .where("hostelId", "==", hostelId)
        .where("roomNumber", "==", parsed.data.roomNumber)
        .limit(1)
        .get();

      if (!existing.empty) {
        res.status(409).json({
          message: "Room number already exists in this hostel",
        });
        return;
      }

      const roomRef = db.collection("rooms").doc();
      const now = new Date().toISOString();

      const room = {
        id: roomRef.id,
        hostelId,
        roomNumber: parsed.data.roomNumber,
        floor: parsed.data.floor ?? null,
        status: parsed.data.status ?? "ACTIVE",
        maxOccupants: parsed.data.maxOccupants ?? 2,
        createdAt: now,
        updatedAt: now,
      };

      await roomRef.set(room);

      await writeAuditLog({
        actorId: req.authUser.id,
        action: "CREATE_ROOM",
        entityType: "ROOM",
        entityId: roomRef.id,
        metadata: {
          hostelId,
          roomNumber: parsed.data.roomNumber,
          maxOccupants: room.maxOccupants,
        },
      });

      invalidateHostelCaches(hostelId);

      res.status(201).json({
        message: "Room created successfully",
        room,
      });
    } catch (error) {
      next(error);
    }
  },
);

// List rooms
router.get(
  "/:hostelId/rooms",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      const hostelId = req.params.hostelId;

      if (typeof hostelId !== "string") {
        res.status(400).json({ message: "Invalid hostel ID" });
        return;
      }

      const cached = roomsCache.get(hostelId);
      if (cached && Date.now() - cached.timestamp < ROOMS_CACHE_TTL_MS) {
        res.json({ rooms: cached.data });
        return;
      }

      const snapshot = await db
        .collection("rooms")
        .where("hostelId", "==", hostelId)
        .get();

      const rooms = snapshot.docs
  .map((doc) => {
    const data = doc.data();

    return {
      id: doc.id,
      hostelId: String(data.hostelId ?? hostelId),
      roomNumber: String(data.roomNumber ?? ""),
      floor: data.floor ?? null,
      status: data.status ?? "ACTIVE",
      maxOccupants: typeof data.maxOccupants === "number" ? data.maxOccupants : 2,
      createdAt: data.createdAt ?? null,
      updatedAt: data.updatedAt ?? null,
    };
  })
  .sort((a, b) =>
    a.roomNumber.localeCompare(b.roomNumber),
  );

      roomsCache.set(hostelId, { data: rooms, timestamp: Date.now() });
      res.json({ rooms });
    } catch (error) {
      next(error);
    }
  },
);

// Get one room
router.get(
  "/:hostelId/rooms/:roomId",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      const hostelId = req.params.hostelId;
      const roomId = req.params.roomId;

      if (
        typeof hostelId !== "string" ||
        typeof roomId !== "string"
      ) {
        res.status(400).json({ message: "Invalid ID" });
        return;
      }

      const roomRef = db.collection("rooms").doc(roomId);
      const room = await roomRef.get();

      if (!room.exists) {
        res.status(404).json({ message: "Room not found" });
        return;
      }

      const data = room.data();

      if (data?.hostelId !== hostelId) {
        res.status(404).json({ message: "Room not found" });
        return;
      }

      res.json({
        room: {
          id: room.id,
          ...data,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// Update room
router.patch(
  "/:hostelId/rooms/:roomId",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN" &&
        req.authUser?.role !== "PARTNER"
      ) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const hostelId = req.params.hostelId;
      const roomId = req.params.roomId;

      if (
        typeof hostelId !== "string" ||
        typeof roomId !== "string"
      ) {
        res.status(400).json({ message: "Invalid ID" });
        return;
      }

      const parsed = updateRoomSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          message: "Invalid room data",
          errors: parsed.error.flatten(),
        });
        return;
      }

      const roomRef = db.collection("rooms").doc(roomId);
      const room = await roomRef.get();

      if (!room.exists || room.data()?.hostelId !== hostelId) {
        res.status(404).json({ message: "Room not found" });
        return;
      }

      if (parsed.data.roomNumber) {
        const duplicate = await db
          .collection("rooms")
          .where("hostelId", "==", hostelId)
          .where("roomNumber", "==", parsed.data.roomNumber)
          .limit(2)
          .get();

        const duplicateExists = duplicate.docs.some(
          (doc) => doc.id !== roomId,
        );

        if (duplicateExists) {
          res.status(409).json({
            message: "Room number already exists in this hostel",
          });
          return;
        }
      }

      await roomRef.update({
        ...parsed.data,
        updatedAt: new Date().toISOString(),
      });

      const updated = await roomRef.get();

      await writeAuditLog({
        actorId: req.authUser.id,
        action: "UPDATE_ROOM",
        entityType: "ROOM",
        entityId: roomId,
        metadata: parsed.data,
      });

      invalidateHostelCaches(hostelId);

      res.json({
        message: "Room updated successfully",
        room: {
          id: updated.id,
          ...updated.data(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// Delete room
router.delete(
  "/:hostelId/rooms/:roomId",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN" &&
        req.authUser?.role !== "PARTNER"
      ) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const hostelId = req.params.hostelId;
      const roomId = req.params.roomId;

      if (
        typeof hostelId !== "string" ||
        typeof roomId !== "string"
      ) {
        res.status(400).json({ message: "Invalid ID" });
        return;
      }

      const roomRef = db.collection("rooms").doc(roomId);
      const room = await roomRef.get();

      if (!room.exists || room.data()?.hostelId !== hostelId) {
        res.status(404).json({ message: "Room not found" });
        return;
      }

      const activeRenters = await db
        .collection("renters")
        .where("hostelId", "==", hostelId)
        .where("roomId", "==", roomId)
        .where("status", "==", "ACTIVE")
        .limit(1)
        .get();

      if (!activeRenters.empty) {
        res.status(409).json({
          message: "Cannot delete a room with an active renter",
        });
        return;
      }

      await roomRef.delete();

      await writeAuditLog({
        actorId: req.authUser.id,
        action: "DELETE_ROOM",
        entityType: "ROOM",
        entityId: roomId,
        metadata: { hostelId },
      });

      invalidateHostelCaches(hostelId);

      res.json({
        message: "Room deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── GET room occupants ────────────────────────────────────────────────────────
router.get(
  "/:hostelId/rooms/:roomId/occupants",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      const { hostelId, roomId } = req.params;
      if (typeof hostelId !== "string" || typeof roomId !== "string") {
        res.status(400).json({ message: "Invalid ID" });
        return;
      }

      const rentersSnap = await db
        .collection("renters")
        .where("hostelId", "==", hostelId)
        .where("roomId", "==", roomId)
        .where("status", "==", "ACTIVE")
        .get();

      const occupants = await Promise.all(
        rentersSnap.docs.map(async (doc) => {
          const data = doc.data();
          let userData: Record<string, unknown> = {};
          if (data.userId) {
            const userSnap = await db.collection("users").doc(data.userId).get();
            if (userSnap.exists) userData = userSnap.data() ?? {};
          }
          return {
            id: doc.id,
            userId: data.userId ?? null,
            status: data.status ?? "ACTIVE",
            joiningDate: data.joiningDate ?? null,
            monthlyFee: data.monthlyFee ?? null,
            securityDeposit: data.securityDeposit ?? null,
            guardianName: data.guardianName ?? null,
            guardianPhone: data.guardianPhone ?? null,
            user: {
              firstName: userData.firstName ?? null,
              lastName: userData.lastName ?? null,
              email: userData.email ?? null,
              phone: userData.phone ?? null,
            },
          };
        })
      );

      res.json({ occupants });
    } catch (error) {
      next(error);
    }
  }
);

// ── PATCH room capacity ───────────────────────────────────────────────────────
router.patch(
  "/:hostelId/rooms/:roomId/capacity",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (req.authUser?.role !== "SUPER_ADMIN" && req.authUser?.role !== "ADMIN" && req.authUser?.role !== "PARTNER") {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const hostelId = req.params.hostelId as string;
      const roomId = req.params.roomId as string;
      const { maxOccupants } = req.body as { maxOccupants?: number };


      if (maxOccupants === undefined || typeof maxOccupants !== "number" || maxOccupants < 1) {
        res.status(400).json({ message: "maxOccupants must be a positive integer" });
        return;
      }

      const roomRef = db.collection("rooms").doc(roomId);
      const room = await roomRef.get();
      if (!room.exists || room.data()?.hostelId !== hostelId) {
        res.status(404).json({ message: "Room not found" });
        return;
      }

      await roomRef.update({ maxOccupants, updatedAt: new Date().toISOString() });
      res.json({ message: "Capacity updated", maxOccupants });
    } catch (error) {
      next(error);
    }
  }
);

// ── PATCH transfer renter to another room ─────────────────────────────────────
router.patch(
  "/:hostelId/rooms/:roomId/transfer",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (req.authUser?.role !== "SUPER_ADMIN" && req.authUser?.role !== "ADMIN" && req.authUser?.role !== "PARTNER") {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const hostelId = req.params.hostelId as string;
      const sourceRoomId = req.params.roomId as string;
      const { renterId, targetRoomId } = req.body as { renterId?: string; targetRoomId?: string };

      if (!renterId || !targetRoomId) {
        res.status(400).json({ message: "renterId and targetRoomId are required" });
        return;
      }
      if (sourceRoomId === targetRoomId) {
        res.status(400).json({ message: "Source and target rooms are the same" });
        return;
      }

      // Verify target room exists in same hostel
      const targetRoomRef = db.collection("rooms").doc(targetRoomId);
      const targetRoom = await targetRoomRef.get();
      if (!targetRoom.exists || targetRoom.data()?.hostelId !== hostelId) {
        res.status(404).json({ message: "Target room not found in this hostel" });
        return;
      }

      // Verify renter exists and is in source room
      const renterRef = db.collection("renters").doc(renterId);
      const renter = await renterRef.get();
      if (!renter.exists || renter.data()?.hostelId !== hostelId) {
        res.status(404).json({ message: "Renter not found" });
        return;
      }
      if (renter.data()?.roomId !== sourceRoomId) {
        res.status(400).json({ message: "Renter is not in the source room" });
        return;
      }

      // Check capacity of target room
      const targetMaxOccupants: number = targetRoom.data()?.maxOccupants ?? 999;
      const targetCurrentSnap = await db
        .collection("renters")
        .where("hostelId", "==", hostelId)
        .where("roomId", "==", targetRoomId)
        .where("status", "==", "ACTIVE")
        .get();
      if (targetCurrentSnap.size >= targetMaxOccupants) {
        res.status(409).json({ message: "Target room is at full capacity" });
        return;
      }

      const now = new Date().toISOString();
      // Move renter
      await renterRef.update({ roomId: targetRoomId, updatedAt: now });

      // Update source room status
      const sourceRemaining = await db
        .collection("renters")
        .where("hostelId", "==", hostelId)
        .where("roomId", "==", sourceRoomId)
        .where("status", "==", "ACTIVE")
        .get();
      const sourceOccupied = sourceRemaining.docs.filter((d) => d.id !== renterId).length;
      // Update rooms
      const sourceRef = db.collection("rooms").doc(sourceRoomId);
      await sourceRef.update({
        status: "ACTIVE",
        updatedAt: now,
      });

      // Update target room status
      await targetRoomRef.update({ status: "ACTIVE", updatedAt: now });

      await writeAuditLog({
        actorId: req.authUser.id,
        action: "TRANSFER_RENTER",
        entityType: "RENTER",
        entityId: renterId,
        metadata: { hostelId, sourceRoomId, targetRoomId },
      });

      invalidateHostelCaches(hostelId);

      res.json({ message: "Renter transferred successfully" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

