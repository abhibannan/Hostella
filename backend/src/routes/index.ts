import { Router } from "express";

import authRouter from "../modules/auth/auth.routes.js";
import hostelsRouter from "../modules/hostels/hostels.routes.js";
import payment_proofs_routes from "../modules/payment-proofs/payment-proofs.routes.js";
import roomsRouter from "../modules/rooms/rooms.routes.js";
import rentersRouter from "../modules/renters/renters.routes.js";
import feesRouter from "../modules/fees/fees.routes.js";
import repairsRouter from "../modules/repairs/repairs.routes.js";
import dashboardRouter from "../modules/dashboard/dashboard.routes.js";
import uploadsRouter from "../modules/uploads/uploads.routes.js";
import expensesRouter from "../modules/expenses/expenses.routes.js";
import notificationsRouter from "../modules/notifications/notifications.routes.js";
import auditLogsRouter from "../modules/audit-logs/audit-logs.routes.js";

import { getPlatformConfig } from "../services/telemetry.service.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Hostella API",
    database: "Firebase Firestore",
  });
});

router.get("/platform/status", (_req, res) => {
  const config = getPlatformConfig();
  res.json({
    maintenanceMode: config.maintenanceMode,
    maintenanceNotice: config.maintenanceNotice,
    alertBanner: config.alertBanner,
  });
});

router.use("/auth", authRouter);
router.use("/hostels", hostelsRouter);
router.use("/hostels", roomsRouter);
router.use("/hostels", rentersRouter);
router.use("/hostels", feesRouter);
router.use("/hostels", repairsRouter);
router.use("/notifications", notificationsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/uploads", uploadsRouter);
router.use("/hostels", payment_proofs_routes);
router.use("/hostels", expensesRouter);
router.use("/hostels", auditLogsRouter);

// Public route to fetch available rooms for a hostel during onboarding
router.get("/renters/onboard/rooms", async (req, res, next) => {
  try {
    const hostelId = req.query.hostelId as string;
    if (!hostelId) {
      res.status(400).json({ message: "hostelId query parameter is required" });
      return;
    }
    const { db } = await import("../config/firebase.js");

    const [hostelDoc, roomsSnap, rentersSnap] = await Promise.all([
      db.collection("hostels").doc(hostelId).get(),
      db.collection("rooms").where("hostelId", "==", hostelId).get(),
      db.collection("renters").where("hostelId", "==", hostelId).where("status", "==", "ACTIVE").get(),
    ]);

    const hostelName = hostelDoc.exists ? hostelDoc.data()?.name || "Hostel" : "Hostel";

    const occupancyByRoom: Record<string, number> = {};
    rentersSnap.forEach((doc) => {
      const data = doc.data();
      if (data.roomId) {
        occupancyByRoom[data.roomId] = (occupancyByRoom[data.roomId] || 0) + 1;
      }
    });

    const rooms = roomsSnap.docs.map((doc) => {
      const data = doc.data();
      const capacity = Number(data.capacity || 1);
      const occupied = occupancyByRoom[doc.id] || 0;
      const availableBeds = Math.max(0, capacity - occupied);
      return {
        id: doc.id,
        roomNumber: String(data.roomNumber || ""),
        floor: data.floor || "",
        capacity,
        occupied,
        availableBeds,
        baseRent: Number(data.baseRent || 0),
        status: data.status || "ACTIVE",
      };
    })
    .filter((r) => r.status === "ACTIVE")
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));

    res.json({ hostelName, rooms });
  } catch (err) {
    next(err);
  }
});

// Public route for renter self-onboarding from QR code
router.post("/renters/onboard", async (req, res, next) => {
  try {
    const { name, email, phone, password, emergencyContactName, emergencyContactPhone, address, hostelId, room: roomNumber } = req.body;

    if (
      !name?.trim() ||
      !email?.trim() ||
      !phone?.trim() ||
      !password ||
      !emergencyContactName?.trim() ||
      !emergencyContactPhone?.trim() ||
      !address?.trim() ||
      !hostelId?.trim() ||
      !roomNumber?.toString().trim()
    ) {
      res.status(400).json({ message: "All details are required. No fields can be left blank." });
      return;
    }

    const cleanRoomNumber = String(roomNumber).trim();

    // Import db dynamically here to avoid circular dependency issues at the top level if any
    const { db, firebaseAuth } = await import("../config/firebase.js");
    
    // Lookup room to get roomId and base rent
    const roomsSnap = await db.collection("rooms")
      .where("hostelId", "==", hostelId)
      .where("roomNumber", "==", cleanRoomNumber)
      .limit(1)
      .get();

    if (roomsSnap.empty) {
      res.status(404).json({ message: `Room ${cleanRoomNumber} not found in this hostel.` });
      return;
    }
    const roomDoc = roomsSnap.docs[0];
    if (!roomDoc) {
      res.status(404).json({ message: `Room ${cleanRoomNumber} not found in this hostel.` });
      return;
    }
    const roomId = roomDoc.id;
    const monthlyFee = roomDoc.data()?.baseRent || 0;
    
    const nameParts = name.split(" ");
    const firstName = nameParts[0] || "Unknown";
    const lastName = nameParts.slice(1).join(" ");
    const joiningDate = new Date().toISOString().split("T")[0] as string;
    
    let firebaseUid;
    try {
      const fbUser = await firebaseAuth.createUser({
        email,
        password: password,
        displayName: name
      });
      firebaseUid = fbUser.uid;
    } catch (err: any) {
      if (err.code === 'auth/email-already-exists') {
        res.status(409).json({ message: "An account with this email already exists." });
        return;
      }
      throw err;
    }

    const now = new Date().toISOString();
    
    const userRef = db.collection("users").doc();
    const userProfile = {
      id: userRef.id,
      firebaseUid,
      firstName,
      lastName,
      email,
      phone,
      address,
      city: "",
      state: "",
      pincode: "",
      role: "RENTER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    const renterRef = db.collection("renters").doc();
    const renter = {
      id: renterRef.id,
      userId: userRef.id,
      hostelId,
      roomId,
      guardianName: emergencyContactName,
      guardianPhone: emergencyContactPhone,
      joiningDate,
      monthlyFee,
      securityDeposit: 0,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    const feeRef = db.collection("fees").doc();
    const firstFeeMonth = joiningDate.slice(0, 7) as string;
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
    batch.set(userRef, userProfile);
    batch.set(renterRef, renter);
    batch.set(feeRef, fee);
    await batch.commit();
    
    res.status(201).json({ message: "Registration submitted successfully" });
  } catch (err) {
    next(err);
  }
});

export default router;