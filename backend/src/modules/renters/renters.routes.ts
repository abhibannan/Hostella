import { Router } from "express";
import { z } from "zod";
import {
  db,
  firebaseAuth,
  storage,
} from "../../config/firebase.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireHostelAccess } from "../../middleware/hostel-access.middleware.js";
import { writeAuditLog } from "../../utils/audit.js";
import { invalidateHostelCaches } from "../../utils/cache.js";

const router = Router();

const DELETE_BATCH_SIZE = 400;

async function deleteQueryDocuments(
  query: FirebaseFirestore.Query,
): Promise<void> {
  while (true) {
    const snapshot = await query.limit(DELETE_BATCH_SIZE).get();

    if (snapshot.empty) return;

    const batch = db.batch();

    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }

    await batch.commit();

    if (snapshot.size < DELETE_BATCH_SIZE) return;
  }
}

async function deleteRenterRelatedFiles(
  userId: string,
): Promise<void> {
  const snapshot = await db
    .collection("uploads")
    .where("userId", "==", userId)
    .get();

  for (const doc of snapshot.docs) {
    const storagePath = String(doc.data()?.storagePath ?? "");

    if (storagePath) {
      try {
        await storage.file(storagePath).delete({
          ignoreNotFound: true,
        });
      } catch (error) {
        console.error(
          `RENTER STORAGE CLEANUP FAILED (${storagePath}):`,
          error,
        );
        throw error;
      }
    }
  }

  await deleteQueryDocuments(
    db
      .collection("uploads")
      .where("userId", "==", userId),
  );
}

async function deleteRenterAuditLogs(
  renterId: string,
  userId: string,
): Promise<void> {
  const queryResults = await Promise.all([
    db
      .collection("auditLogs")
      .where("entityId", "==", renterId)
      .get(),
    db
      .collection("auditLogs")
      .where("actorId", "==", userId)
      .get(),
    db
      .collection("auditLogs")
      .where("metadata.renterId", "==", renterId)
      .get(),
    db
      .collection("auditLogs")
      .where("metadata.userId", "==", userId)
      .get(),
  ]);

  const refs = new Map<string, FirebaseFirestore.DocumentReference>();

  for (const snapshot of queryResults) {
    for (const doc of snapshot.docs) {
      refs.set(doc.id, doc.ref);
    }
  }

  if (!refs.size) return;

  const refList = Array.from(refs.values());

  for (let index = 0; index < refList.length; index += DELETE_BATCH_SIZE) {
    const batch = db.batch();
    const chunk = refList.slice(index, index + DELETE_BATCH_SIZE);

    for (const ref of chunk) {
      batch.delete(ref);
    }

    await batch.commit();
  }
}

/* ---------------------------------------------------------
   SCHEMAS
--------------------------------------------------------- */

const createRenterAccountSchema = z.object({
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().max(100).optional(),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(30).optional().default(""),
  guardianPhone: z.string().trim().max(30).optional().default(""),
  guardianName: z.string().trim().max(100).optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
  city: z.string().trim().max(100).optional().default(""),
  state: z.string().trim().max(100).optional().default(""),
  pincode: z.string().trim().max(20).optional().default(""),
  password: z.string().min(6).max(100).optional(),
  roomId: z.string().min(1),
  joiningDate: z.string().min(1),
  monthlyFee: z.number().nonnegative(),
  securityDeposit: z
    .number()
    .nonnegative()
    .optional(),
});

const renterSchema = z.object({
  userId: z.string().min(1),
  guardianPhone: z.string().trim().max(30).optional().default(""),
  guardianName: z.string().trim().max(100).optional().default(""),
  roomId: z.string().min(1),
  joiningDate: z.string().min(1),
  monthlyFee: z.number().nonnegative(),
  securityDeposit: z
    .number()
    .nonnegative()
    .optional(),
});

const updateRenterSchema = z.object({
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  guardianName: z.string().trim().max(100).optional(),
  guardianPhone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  pincode: z.string().trim().max(20).optional(),
  roomId: z.string().min(1).optional(),
  monthlyFee: z.number().nonnegative().optional(),
  securityDeposit: z
    .number()
    .nonnegative()
    .optional(),
  joiningDate: z.string().min(1).optional(),
  status: z
    .enum([
      "ACTIVE",
      "INACTIVE",
      "LEFT",
    ])
    .optional(),
});

/* ---------------------------------------------------------
   CREATE RENTER ACCOUNT
--------------------------------------------------------- */

router.post(
  "/:hostelId/renters/create-account",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    let createdFirebaseUid: string | null = null;
    let createdUserId: string | null = null;

    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN" &&
        req.authUser?.role !== "PARTNER"
      ) {
        res.status(403).json({
          message: "Access denied",
        });
        return;
      }

      const hostelId = req.params.hostelId;

      if (typeof hostelId !== "string") {
        res.status(400).json({
          message: "Invalid hostel ID",
        });
        return;
      }

      const parsed =
        createRenterAccountSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        const flattened = parsed.error.flatten();
        const fieldErrors = Object.entries(flattened.fieldErrors)
          .filter(([, messages]) => Array.isArray(messages) && messages.length > 0)
          .map(([field, messages]) => `${field}: ${(messages as string[]).join(", ")}`)
          .join(" | ");

        res.status(400).json({
          message: fieldErrors
            ? `Invalid renter data - ${fieldErrors}`
            : "Invalid renter data",
          errors: flattened,
        });
        return;
      }

      const {
        firstName,
        lastName,
        email,
        phone,
        guardianPhone,
        guardianName,
        address,
        city,
        state,
        pincode,
        password,
        roomId,
        joiningDate,
        monthlyFee,
        securityDeposit,
      } = parsed.data;

      /* Verify hostel */

      const hostel = await db
        .collection("hostels")
        .doc(hostelId)
        .get();

      if (!hostel.exists) {
        res.status(404).json({
          message: "Hostel not found",
        });
        return;
      }

      /* Verify room */

      const roomRef = db
        .collection("rooms")
        .doc(roomId);

      const room = await roomRef.get();

      if (
        !room.exists ||
        room.data()?.hostelId !== hostelId
      ) {
        res.status(404).json({
          message: "Room not found",
        });
        return;
      }

      if (
        room.data()?.status === "INACTIVE"
      ) {
        res.status(400).json({
          message: "Room is inactive",
        });
        return;
      }

      /* Capacity check: allow multiple occupants up to maxOccupants (defaults to 2) */

      const maxOccupants = Math.max(1, Number(room.data()?.maxOccupants || 2));
      const roomRenters = await db
        .collection("renters")
        .where("hostelId", "==", hostelId)
        .where("roomId", "==", roomId)
        .where("status", "==", "ACTIVE")
        .get();

      if (roomRenters.size >= maxOccupants) {
        res.status(409).json({
          message: `Room is already at full capacity (${roomRenters.size}/${maxOccupants} occupants)`,
        });
        return;
      }

      /* Validate joining date because it is also used for the first fee month */

      if (!/^\d{4}-\d{2}-\d{2}$/.test(joiningDate)) {
        res.status(400).json({
          message: "Joining date must use YYYY-MM-DD format",
        });
        return;
      }

      const firstFeeMonth = joiningDate.slice(0, 7);

      /* Explicitly prevent adding Admins / Super Admins as renters */
      const normalizedEmail = email.toLowerCase().trim();
      const adminByEmailSnap = await db
        .collection("users")
        .where("email", "==", normalizedEmail)
        .limit(1)
        .get();

      if (!adminByEmailSnap.empty) {
        const existingData = adminByEmailSnap.docs[0]?.data();
        if (existingData?.role === "SUPER_ADMIN" || existingData?.role === "ADMIN") {
          res.status(400).json({
            message: "This email belongs to an Administrator. Administrators cannot be added as renters.",
          });
          return;
        }
      }

      if (phone) {
        const adminByPhoneSnap = await db
          .collection("users")
          .where("phone", "==", phone.trim())
          .limit(1)
          .get();

        if (!adminByPhoneSnap.empty) {
          const existingData = adminByPhoneSnap.docs[0]?.data();
          if (existingData?.role === "SUPER_ADMIN" || existingData?.role === "ADMIN") {
            res.status(400).json({
              message: "This phone number belongs to an Administrator. Administrators cannot be added as renters.",
            });
            return;
          }
        }
      }

      /* Check Firebase account */

      try {
        await firebaseAuth.getUserByEmail(
          email,
        );

        res.status(409).json({
          message:
            "A Firebase account already exists for this email",
        });
        return;
      } catch (error: any) {
        if (
          error?.code !==
          "auth/user-not-found"
        ) {
          throw error;
        }
      }

      /* Create Firebase account */

      const firebaseUser =
        await firebaseAuth.createUser({
          email,
          ...(password ? { password } : {}),
          displayName:
            `${firstName} ${lastName ?? ""}`.trim(),
        });

      createdFirebaseUid =
        firebaseUser.uid;

      /* Create Firestore user */

      const userRef = db
        .collection("users")
        .doc();

      createdUserId = userRef.id;

      const now =
        new Date().toISOString();

      const userProfile = {
        id: userRef.id,
        firebaseUid:
          firebaseUser.uid,
        firstName,
        lastName: lastName ?? "",
        email,
        phone: phone ?? "",
        address: address ?? "",
        city: city ?? "",
        state: state ?? "",
        pincode: pincode ?? "",
        role: "RENTER",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      };

      /* Create renter */

      const renterRef = db
        .collection("renters")
        .doc();

      const renter = {
        id: renterRef.id,
        userId: userRef.id,
        hostelId,
        roomId,
        guardianName: guardianName ?? "",
        guardianPhone: guardianPhone ?? "",
        joiningDate,
        monthlyFee,
        securityDeposit:
          securityDeposit ?? 0,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      };

      /* Automatically create the first monthly fee for the joining month. */

      const feeRef = db
        .collection("fees")
        .doc();

      const fee = {
        id: feeRef.id,
        hostelId,
        renterId: renterRef.id,
        month: firstFeeMonth,
        amount: monthlyFee,
        paidAmount: 0,
        dueDate: joiningDate,
        description: `Monthly fee for ${firstFeeMonth}`,
        status: "PENDING",
        createdAt: now,
        updatedAt: now,
      };

      const batch = db.batch();

      batch.set(
        userRef,
        userProfile,
      );

      batch.set(
        renterRef,
        renter,
      );

      batch.set(
        feeRef,
        fee,
      );

      await batch.commit();

      await writeAuditLog({
        actorId: req.authUser.id,
        action:
          "CREATE_RENTER_ACCOUNT",
        entityType: "RENTER",
        entityId: renterRef.id,
        metadata: {
          hostelId,
          userId: userRef.id,
          roomId,
          email,
          feeId: feeRef.id,
          feeMonth: firstFeeMonth,
          feeAmount: monthlyFee,
        },
      });

      await writeAuditLog({
        actorId: req.authUser.id,
        action: "CREATE_FEE",
        entityType: "FEE",
        entityId: feeRef.id,
        metadata: {
          hostelId,
          renterId: renterRef.id,
          month: firstFeeMonth,
          amount: monthlyFee,
          automatic: true,
        },
      });

      invalidateHostelCaches(hostelId);

      res.status(201).json({
        message:
          "Renter account and initial fee created successfully",

        renter: {
          ...renter,

          user: {
            id: userRef.id,
            firstName,
            lastName: lastName ?? "",
            email,
            phone,
          },
          fee,
        },
      });
    } catch (error) {
      if (createdUserId) {
        try {
          await db
            .collection("users")
            .doc(createdUserId)
            .delete();
        } catch (cleanupError) {
          console.error(
            "RENTER USER PROFILE CLEANUP ERROR:",
            cleanupError,
          );
        }
      }

      if (createdFirebaseUid) {
        try {
          await firebaseAuth.deleteUser(
            createdFirebaseUid,
          );
        } catch (cleanupError) {
          console.error(
            "FIREBASE RENTER ACCOUNT CLEANUP ERROR:",
            cleanupError,
          );
        }
      }

      next(error);
    }
  },
);

/* ---------------------------------------------------------
   CREATE RENTER
--------------------------------------------------------- */

router.post(
  "/:hostelId/renters",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN" &&
        req.authUser?.role !== "PARTNER"
      ) {
        res.status(403).json({
          message: "Access denied",
        });
        return;
      }

      const hostelId = req.params.hostelId;

      if (typeof hostelId !== "string") {
        res.status(400).json({
          message: "Invalid hostel ID",
        });
        return;
      }

      const parsed =
        renterSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          message: "Invalid renter data",
          errors: parsed.error.flatten(),
        });
        return;
      }

      const {
        userId,
        guardianPhone,
        roomId,
        joiningDate,
        monthlyFee,
        securityDeposit,
      } = parsed.data;

      /* User */

      const userRef = db
        .collection("users")
        .doc(userId);

      const user = await userRef.get();

      if (!user.exists) {
        res.status(404).json({
          message: "User not found",
        });
        return;
      }

      if (
        user.data()?.role !== "RENTER"
      ) {
        res.status(400).json({
          message:
            "Selected user is not a Renter",
        });
        return;
      }

      if (
        user.data()?.status !== "ACTIVE"
      ) {
        res.status(400).json({
          message:
            "Renter user is not active",
        });
        return;
      }

      /* Room */

      const room = await db
        .collection("rooms")
        .doc(roomId)
        .get();

      if (
        !room.exists ||
        room.data()?.hostelId !== hostelId
      ) {
        res.status(404).json({
          message: "Room not found",
        });
        return;
      }

      if (
        room.data()?.status !== "ACTIVE"
      ) {
        res.status(400).json({
          message: "Room is inactive",
        });
        return;
      }

      /* Prevent duplicate active assignment */

      const existingRenter = await db
        .collection("renters")
        .where(
          "userId",
          "==",
          userId,
        )
        .where(
          "status",
          "==",
          "ACTIVE",
        )
        .limit(1)
        .get();

      if (!existingRenter.empty) {
        res.status(409).json({
          message:
            "Renter already has an active assignment",
        });
        return;
      }

      const renterRef = db
        .collection("renters")
        .doc();

      const now =
        new Date().toISOString();

      const renter = {
        id: renterRef.id,
        userId,
        hostelId,
        roomId,
        guardianPhone,
        joiningDate,
        monthlyFee,
        securityDeposit:
          securityDeposit ?? 0,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      };

      await renterRef.set(renter);

      await writeAuditLog({
        actorId: req.authUser.id,
        action: "CREATE_RENTER",
        entityType: "RENTER",
        entityId: renterRef.id,
        metadata: {
          hostelId,
          userId,
          roomId,
        },
      });

      invalidateHostelCaches(hostelId);

      res.status(201).json({
        message:
          "Renter created successfully",
        renter,
      });
    } catch (error) {
      next(error);
    }
  },
);

/* ---------------------------------------------------------
   LIST RENTERS
--------------------------------------------------------- */

router.get(
  "/:hostelId/renters",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      const hostelId = req.params.hostelId;

      if (typeof hostelId !== "string") {
        res.status(400).json({
          message: "Invalid hostel ID",
        });
        return;
      }

      const snapshot = await db
        .collection("renters")
        .where(
          "hostelId",
          "==",
          hostelId,
        )
        .get();

      const userIds = Array.from(
        new Set(
          snapshot.docs
            .map((doc) => String(doc.data().userId || ""))
            .filter(Boolean),
        ),
      );

      const roomIds = Array.from(
        new Set(
          snapshot.docs
            .map((doc) => String(doc.data().roomId || ""))
            .filter(Boolean),
        ),
      );

      const [userDocs, roomDocs] = await Promise.all([
        userIds.length > 0
          ? db.getAll(...userIds.map((id) => db.collection("users").doc(id)))
          : [],
        roomIds.length > 0
          ? db.getAll(...roomIds.map((id) => db.collection("rooms").doc(id)))
          : [],
      ]);

      const userMap = new Map<string, any>();
      userDocs.forEach((doc) => {
        if (doc.exists) userMap.set(doc.id, doc.data());
      });

      const roomMap = new Map<string, any>();
      roomDocs.forEach((doc) => {
        if (doc.exists) roomMap.set(doc.id, doc.data());
      });

      const renters = snapshot.docs.map((doc) => {
        const data = doc.data();
        const userData = userMap.get(String(data.userId));
        const roomData = roomMap.get(String(data.roomId));

        return {
          id: doc.id,
          ...data,
          user: userData
            ? {
                id: String(data.userId),
                firstName: userData.firstName ?? "",
                lastName: userData.lastName ?? "",
                email: userData.email ?? "",
                phone: userData.phone ?? "",
              }
            : null,
          room: roomData
            ? {
                id: String(data.roomId),
                roomNumber: roomData.roomNumber ?? "",
                floor: roomData.floor ?? null,
              }
            : null,
        };
      });

      renters.sort((a, b) => {
        const aName =
          `${a.user?.firstName ?? ""} ${a.user?.lastName ?? ""}`.trim();

        const bName =
          `${b.user?.firstName ?? ""} ${b.user?.lastName ?? ""}`.trim();

        return aName.localeCompare(
          bName,
        );
      });

      res.json({
        renters,
      });
    } catch (error) {
      next(error);
    }
  },
);

/* ---------------------------------------------------------
   GET RENTER
--------------------------------------------------------- */

router.get(
  "/:hostelId/renters/:renterId",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      const hostelId =
        req.params.hostelId;

      const renterId =
        req.params.renterId;

      if (
        typeof hostelId !== "string" ||
        typeof renterId !== "string"
      ) {
        res.status(400).json({
          message: "Invalid ID",
        });
        return;
      }

      const renterRef = db
        .collection("renters")
        .doc(renterId);

      const renter =
        await renterRef.get();

      if (
        !renter.exists ||
        renter.data()?.hostelId !==
          hostelId
      ) {
        res.status(404).json({
          message:
            "Renter not found",
        });
        return;
      }

      const data =
        renter.data();

      const [
        user,
        room,
      ] = await Promise.all([
        db
          .collection("users")
          .doc(
            String(
              data?.userId,
            ),
          )
          .get(),

        db
          .collection("rooms")
          .doc(
            String(
              data?.roomId,
            ),
          )
          .get(),
      ]);

      res.json({
        renter: {
          id: renter.id,
          ...data,

          user: user.exists
            ? {
                id: user.id,
                firstName:
                  user.data()
                    ?.firstName ??
                  null,
                lastName:
                  user.data()
                    ?.lastName ??
                  null,
                email:
                  user.data()
                    ?.email ??
                  null,
                phone:
                  user.data()
                    ?.phone ??
                  null,
                profilePhotoUrl:
                  user.data()
                    ?.profilePhotoUrl ??
                  null,
                dateOfBirth:
                  user.data()
                    ?.dateOfBirth ??
                  null,
                gender:
                  user.data()
                    ?.gender ??
                  null,
                address:
                  user.data()
                    ?.address ??
                  null,
                city:
                  user.data()
                    ?.city ??
                  null,
                state:
                  user.data()
                    ?.state ??
                  null,
                pincode:
                  user.data()
                    ?.pincode ??
                  null,
                emergencyContactName:
                  user.data()
                    ?.emergencyContactName ??
                  null,
                emergencyContactPhone:
                  user.data()
                    ?.emergencyContactPhone ??
                  null,
              }
            : null,

          room: room.exists
            ? {
                id: room.id,
                roomNumber:
                  room.data()
                    ?.roomNumber ??
                  null,
                floor:
                  room.data()
                    ?.floor ??
                  null,
              }
            : null,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/* ---------------------------------------------------------
   UPDATE RENTER
--------------------------------------------------------- */

router.patch(
  "/:hostelId/renters/:renterId",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN" &&
        req.authUser?.role !== "PARTNER"
      ) {
        res.status(403).json({
          message: "Access denied",
        });
        return;
      }

      const hostelId =
        req.params.hostelId;

      const renterId =
        req.params.renterId;

      if (
        typeof hostelId !== "string" ||
        typeof renterId !== "string"
      ) {
        res.status(400).json({
          message: "Invalid ID",
        });
        return;
      }

      const parsed =
        updateRenterSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        res.status(400).json({
          message: "Invalid renter data",
          errors: parsed.error.flatten(),
        });
        return;
      }

      const renterRef = db
        .collection("renters")
        .doc(renterId);

      const renter =
        await renterRef.get();

      if (
        !renter.exists ||
        renter.data()?.hostelId !==
          hostelId
      ) {
        res.status(404).json({
          message:
            "Renter not found",
        });
        return;
      }

      /* If changing room, verify new room and capacity */

      if (parsed.data.roomId && parsed.data.roomId !== renter.data()?.roomId) {
        const newRoom =
          await db
            .collection("rooms")
            .doc(
              parsed.data.roomId,
            )
            .get();

        if (
          !newRoom.exists ||
          newRoom.data()
            ?.hostelId !==
            hostelId
        ) {
          res.status(404).json({
            message:
              "New room not found",
          });
          return;
        }

        if (
          newRoom.data()
            ?.status ===
          "INACTIVE"
        ) {
          res.status(400).json({
            message:
              "New room is inactive",
          });
          return;
        }

        const maxOccupants = Math.max(1, Number(newRoom.data()?.maxOccupants || 2));
        const activeOccupantsSnap = await db
          .collection("renters")
          .where("hostelId", "==", hostelId)
          .where("roomId", "==", parsed.data.roomId)
          .where("status", "==", "ACTIVE")
          .get();

        if (activeOccupantsSnap.size >= maxOccupants) {
          res.status(409).json({
            message: `New room is already at full capacity (${activeOccupantsSnap.size}/${maxOccupants} occupants)`,
          });
          return;
        }
      }

      const now =
        new Date().toISOString();

      const renterUpdates: Record<string, any> = {
        updatedAt: now,
      };

      if (parsed.data.roomId !== undefined) renterUpdates.roomId = parsed.data.roomId;
      if (parsed.data.monthlyFee !== undefined) {
        renterUpdates.monthlyFee = parsed.data.monthlyFee;
        try {
          const pendingFeesSnap = await db
            .collection("fees")
            .where("hostelId", "==", hostelId)
            .where("renterId", "==", renterId)
            .where("status", "==", "PENDING")
            .get();

          if (!pendingFeesSnap.empty) {
            const batch = db.batch();
            for (const feeDoc of pendingFeesSnap.docs) {
              batch.update(feeDoc.ref, { amount: parsed.data.monthlyFee, updatedAt: now });
            }
            await batch.commit();
          }
        } catch(err) {
          console.error("Failed to update pending fees amount", err);
        }
      }
      if (parsed.data.securityDeposit !== undefined) renterUpdates.securityDeposit = parsed.data.securityDeposit;
      if (parsed.data.joiningDate !== undefined) renterUpdates.joiningDate = parsed.data.joiningDate;
      if (parsed.data.status !== undefined) renterUpdates.status = parsed.data.status;
      if (parsed.data.guardianName !== undefined) renterUpdates.guardianName = parsed.data.guardianName;
      if (parsed.data.guardianPhone !== undefined) renterUpdates.guardianPhone = parsed.data.guardianPhone;

      await renterRef.update(renterUpdates);

      // When a renter leaves (status → INACTIVE or LEFT), purge their upcoming
      // unpaid fees (dueDate >= today). Past/paid fees are kept for audit purposes.
      if (parsed.data.status === "INACTIVE" || parsed.data.status === "LEFT") {
        try {
          const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
          const upcomingFeesSnap = await db
            .collection("fees")
            .where("hostelId", "==", hostelId)
            .where("renterId", "==", renterId)
            .where("status", "==", "PENDING")
            .get();

          const batch = db.batch();
          let deletedCount = 0;

          for (const feeDoc of upcomingFeesSnap.docs) {
            const dueDate = String(feeDoc.data()?.dueDate ?? "");
            // Only delete fees that are due today or in the future
            if (dueDate >= today) {
              batch.delete(feeDoc.ref);
              deletedCount++;
            }
          }

          if (deletedCount > 0) {
            await batch.commit();
            console.log(
              `[RENTER_CHECKOUT] Purged ${deletedCount} upcoming fees for renter ${renterId} (status → ${parsed.data.status})`,
            );
          }
        } catch (feeCleanupError) {
          // Log but don't block the renter update
          console.error("[RENTER_CHECKOUT] Failed to purge upcoming fees:", feeCleanupError);
        }
      }


      const renterUserId = renter.data()?.userId;
      if (renterUserId) {
        const userUpdates: Record<string, any> = {};
        if (parsed.data.address !== undefined) userUpdates.address = parsed.data.address;
        if (parsed.data.city !== undefined) userUpdates.city = parsed.data.city;
        if (parsed.data.state !== undefined) userUpdates.state = parsed.data.state;
        if (parsed.data.pincode !== undefined) userUpdates.pincode = parsed.data.pincode;
        if (parsed.data.phone !== undefined) userUpdates.phone = parsed.data.phone;
        if (parsed.data.firstName !== undefined) userUpdates.firstName = parsed.data.firstName;
        if (parsed.data.lastName !== undefined) userUpdates.lastName = parsed.data.lastName;

        if (Object.keys(userUpdates).length > 0) {
          userUpdates.updatedAt = now;
          await db.collection("users").doc(renterUserId).update(userUpdates);
        }
      }

      const updated =
        await renterRef.get();

      await writeAuditLog({
        actorId:
          req.authUser.id,
        action:
          "UPDATE_RENTER",
        entityType:
          "RENTER",
        entityId:
          renterId,
        metadata:
          parsed.data,
      });

      invalidateHostelCaches(hostelId);

      res.json({
        message:
          "Renter updated successfully",

        renter: {
          id: updated.id,
          ...updated.data(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/* ---------------------------------------------------------
   PERMANENTLY DELETE RENTER AND ALL RELATED DATA
--------------------------------------------------------- */

router.delete(
  "/:hostelId/renters/:renterId",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (
        req.authUser?.role !== "SUPER_ADMIN" &&
        req.authUser?.role !== "ADMIN" &&
        req.authUser?.role !== "PARTNER"
      ) {
        res.status(403).json({
          message: "Access denied",
        });
        return;
      }

      const hostelId = req.params.hostelId;
      const renterId = req.params.renterId;

      if (
        typeof hostelId !== "string" ||
        typeof renterId !== "string"
      ) {
        res.status(400).json({
          message: "Invalid ID",
        });
        return;
      }

      const renterRef = db
        .collection("renters")
        .doc(renterId);

      const renterSnapshot = await renterRef.get();

      if (
        !renterSnapshot.exists ||
        renterSnapshot.data()?.hostelId !== hostelId
      ) {
        res.status(404).json({
          message: "Renter not found",
        });
        return;
      }

      const renterData = renterSnapshot.data() ?? {};
      const userId = String(renterData.userId ?? "");

      if (!userId) {
        res.status(409).json({
          message: "Renter account is missing its user profile link",
        });
        return;
      }

      const userRef = db.collection("users").doc(userId);
      const userSnapshot = await userRef.get();
      const userData = userSnapshot.data() ?? {};
      const firebaseUid = String(userData.firebaseUid ?? "");
      const renterFullName = `${userData.firstName ?? ""} ${userData.lastName ?? ""}`.trim() || "Former Resident";
      const renterEmail = String(userData.email ?? "");
      const renterPhone = String(userData.phone ?? "");

      // PRESERVE FINANCIAL RECORDS: Stamp renter identity onto fees and payments so paid records & totals stay intact
      const [feesSnap, paymentsSnap] = await Promise.all([
        db
          .collection("fees")
          .where("hostelId", "==", hostelId)
          .where("renterId", "==", renterId)
          .get(),
        db
          .collection("payments")
          .where("hostelId", "==", hostelId)
          .where("renterId", "==", renterId)
          .get(),
      ]);

      const batch = db.batch();
      feesSnap.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      paymentsSnap.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      if (!feesSnap.empty || !paymentsSnap.empty) {
        await batch.commit();
      }

      // Vacate room/bed if allocated
      const roomId = renterData.roomId ? String(renterData.roomId) : null;
      const bedId = renterData.bedId ? String(renterData.bedId) : null;
      if (roomId && bedId) {
        try {
          const roomRef = db.collection("rooms").doc(roomId);
          const roomSnap = await roomRef.get();
          if (roomSnap.exists) {
            const rData = roomSnap.data();
            const beds = Array.isArray(rData?.beds) ? rData!.beds : [];
            const updatedBeds = beds.map((b: any) =>
              b.id === bedId || b.renterId === renterId
                ? { ...b, isOccupied: false, renterId: null }
                : b,
            );
            await roomRef.update({
              beds: updatedBeds,
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (roomErr) {
          console.error("VACATE ROOM ERROR:", roomErr);
        }
      }

      // Delete user notifications & transient uploads, but keep audit logs, fees, and payments
      await Promise.all([
        deleteQueryDocuments(
          db
            .collection("notifications")
            .where("userId", "==", userId),
        ),
      ]);

      await renterRef.delete();

      if (userSnapshot.exists) {
        await userRef.delete();
      }

      // Delete the Firebase Authentication account too, so the renter
      // cannot sign in again with the deleted account.
      if (firebaseUid) {
        try {
          await firebaseAuth.deleteUser(firebaseUid);
        } catch (error: any) {
          if (error?.code !== "auth/user-not-found") {
            throw error;
          }
        }
      }

      invalidateHostelCaches(hostelId);

      res.json({
        message:
          "Renter and all related data deleted permanently",
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;