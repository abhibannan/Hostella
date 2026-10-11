import { Router } from "express";
import { z } from "zod";
import { firebaseAuth, db } from "../../config/firebase.js";
import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { invalidateHostelAccessCache } from "../../middleware/hostel-access.middleware.js";
import { writeAuditLog } from "../../utils/audit.js";
import { sendPasswordEmail } from "../../utils/mailer.js";
import {
  getSystemTelemetry,
  runDeepDiagnostics,
  getSecurityAuditLogs,
  getSystemLogs,
  clearSystemLogs,
  getPlatformConfig,
  updatePlatformConfig,
} from "../../services/telemetry.service.js";

const router = Router();

const profileSchema = z.object({
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().max(100).optional(),
});

router.post("/bootstrap", requireAuth, async (req, res, next) => {
  try {
    const firebaseUser = req.firebaseUser;
    if (!firebaseUser?.email) {
      res.status(400).json({ message: "Firebase account must have an email" });
      return;
    }

    const email = firebaseUser.email.toLowerCase();

    if (email !== env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
      res.status(403).json({ message: "This account is not authorized for bootstrap" });
      return;
    }

    const existingSuperAdmin = await db
      .collection("users")
      .where("role", "==", "SUPER_ADMIN")
      .limit(20)
      .get();

    if (existingSuperAdmin.docs.some((item) => item.data().status === "ACTIVE")) {
      res.status(409).json({ message: "Super Admin already exists" });
      return;
    }

    const existingUser = await db.collection("users").doc(firebaseUser.uid).get();
    if (existingUser.exists) {
      res.status(409).json({ message: "User already exists" });
      return;
    }

    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid profile data",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const now = new Date().toISOString();
    const user = {
      id: firebaseUser.uid,
      firebaseUid: firebaseUser.uid,
      email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName?.trim() || null,
      phone: firebaseUser.phone_number ?? null,
      profilePhotoUrl: firebaseUser.picture ?? null,
      role: "SUPER_ADMIN" as const,
      status: "ACTIVE" as const,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection("users").doc(firebaseUser.uid).set(user);
    await writeAuditLog({
      actorId: firebaseUser.uid,
      action: "BOOTSTRAP_SUPER_ADMIN",
      entityType: "USER",
      entityId: firebaseUser.uid,
    });

    res.status(201).json({
      message: "Super Admin created successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res) => {
  res.status(200).json({ user: req.authUser });
});

const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  guardianName: z.string().trim().max(100).optional(),
  guardianPhone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  pincode: z.string().trim().max(20).optional(),
  emergencyContactName: z.string().trim().max(100).optional(),
  emergencyContactPhone: z.string().trim().max(30).optional(),
});

router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid profile data",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const data = parsed.data;
    const now = new Date().toISOString();

    const userUpdates: Record<string, any> = {
      ...(data.firstName !== undefined && { firstName: data.firstName }),
      ...(data.lastName !== undefined && { lastName: data.lastName.trim() || null }),
      ...(data.phone !== undefined && { phone: data.phone.trim() || null }),
      ...(data.guardianName !== undefined && { guardianName: data.guardianName.trim() || null }),
      ...(data.guardianPhone !== undefined && { guardianPhone: data.guardianPhone.trim() || null }),
      ...(data.address !== undefined && { address: data.address.trim() || null }),
      ...(data.city !== undefined && { city: data.city.trim() || null }),
      ...(data.state !== undefined && { state: data.state.trim() || null }),
      ...(data.pincode !== undefined && { pincode: data.pincode.trim() || null }),
      ...(data.emergencyContactName !== undefined && { emergencyContactName: data.emergencyContactName.trim() || null }),
      ...(data.emergencyContactPhone !== undefined && { emergencyContactPhone: data.emergencyContactPhone.trim() || null }),
      updatedAt: now,
    };

    await db.collection("users").doc(req.authUser!.id).update(userUpdates);

    // If this user is a renter, also sync their renter doc
    const renterDocs = await db
      .collection("renters")
      .where("userId", "==", req.authUser!.id)
      .get();

    if (!renterDocs.empty) {
      const renterUpdates: Record<string, any> = {
        updatedAt: now,
        ...(data.guardianName !== undefined && { guardianName: data.guardianName.trim() || "" }),
        ...(data.guardianPhone !== undefined && { guardianPhone: data.guardianPhone.trim() || "" }),
      };
      await Promise.all(
        renterDocs.docs.map((doc) => doc.ref.update(renterUpdates)),
      );
    }

    const updated = await db.collection("users").doc(req.authUser!.id).get();

    res.json({
      message: "Profile updated successfully",
      user: { id: updated.id, ...updated.data() },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/admins", requireAuth, async (req, res, next) => {
  try {
    if (req.authUser?.role !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Only Super Admin can list administrators" });
      return;
    }

    const [usersSnap, assignmentsSnap, hostelsSnap] = await Promise.all([
      db.collection("users").get(),
      db.collection("hostelAdmins").get(),
      db.collection("hostels").get(),
    ]);

    const hostelMap = new Map<string, string>();
    hostelsSnap.docs.forEach((h) => hostelMap.set(h.id, h.data()?.name || "Unnamed Hostel"));

    const adminAssignments = new Map<string, Array<{ hostelId: string; hostelName: string }>>();
    assignmentsSnap.docs.forEach((doc) => {
      const data = doc.data();
      const adminId = String(data.adminId || "");
      const hostelId = String(data.hostelId || doc.id);
      if (adminId) {
        const list = adminAssignments.get(adminId) || [];
        list.push({ hostelId, hostelName: hostelMap.get(hostelId) || hostelId });
        adminAssignments.set(adminId, list);
      }
    });

    const admins = usersSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as any))
      .filter((u) => u.role === "ADMIN" || u.role === "SUPER_ADMIN")
      .map((admin) => ({
        ...admin,
        assignedHostels: adminAssignments.get(admin.id) || [],
      }));

    res.json({ admins });
  } catch (error) {
    next(error);
  }
});

router.post("/admins", requireAuth, async (req, res, next) => {
  try {
    if (req.authUser?.role !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Only Super Admin can create admins" });
      return;
    }

    const schema = profileSchema.extend({
      email: z.string().email(),
      password: z.string().min(6).max(128),
      phone: z.string().max(30).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid admin data",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const normalizedEmail = parsed.data.email.toLowerCase().trim();

    // Check if user already exists in Firestore
    const existingSnap = await db
      .collection("users")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      res.status(409).json({ message: "An account with this email already exists" });
      return;
    }

    // Prepare phone number for Firebase Auth (must strictly be E.164 if passed to auth)
    let authPhoneNumber: string | undefined;
    if (parsed.data.phone) {
      const cleaned = parsed.data.phone.replace(/[\s\-()]/g, "");
      if (/^\+[1-9]\d{6,14}$/.test(cleaned)) {
        authPhoneNumber = cleaned;
      }
    }

    let firebaseUser;
    try {
      firebaseUser = await firebaseAuth.createUser({
        email: normalizedEmail,
        password: parsed.data.password,
        displayName: `${parsed.data.firstName} ${parsed.data.lastName ?? ""}`.trim(),
        ...(authPhoneNumber ? { phoneNumber: authPhoneNumber } : {}),
      });
    } catch (createErr: any) {
      if (createErr?.code === "auth/email-already-in-use") {
        // User already in Firebase Auth, update credentials and link
        firebaseUser = await firebaseAuth.getUserByEmail(normalizedEmail);
        await firebaseAuth.updateUser(firebaseUser.uid, {
          password: parsed.data.password,
          displayName: `${parsed.data.firstName} ${parsed.data.lastName ?? ""}`.trim(),
        });
      } else {
        res.status(400).json({
          message: createErr?.message || "Failed to create authentication user in Firebase",
        });
        return;
      }
    }

    const now = new Date().toISOString();
    const user = {
      id: firebaseUser.uid,
      firebaseUid: firebaseUser.uid,
      email: firebaseUser.email!,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName?.trim() || null,
      phone: parsed.data.phone ?? null,
      profilePhotoUrl: null,
      role: "ADMIN" as const,
      status: "ACTIVE" as const,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection("users").doc(firebaseUser.uid).set(user);
    await writeAuditLog({
      actorId: req.authUser.id,
      action: "CREATE_ADMIN",
      entityType: "USER",
      entityId: firebaseUser.uid,
    });

    res.status(201).json({
      message: "Admin created successfully",
      user,
    });
  } catch (error: any) {
    console.error("ADMIN CREATION ROUTE ERROR:", error);
    res.status(400).json({
      message: error?.message || "An unexpected error occurred while creating the admin.",
    });
  }
});

router.patch("/admins/:adminId/status", requireAuth, async (req, res, next) => {
  try {
    if (req.authUser?.role !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Only Super Admin can update admin status" });
      return;
    }

    const adminId = String(req.params.adminId || "");
    if (!adminId) {
      res.status(400).json({ message: "Invalid admin ID" });
      return;
    }
    if (adminId === req.authUser.id) {
      res.status(400).json({ message: "You cannot change your own status" });
      return;
    }

    const { status } = req.body;
    if (!["ACTIVE", "INACTIVE"].includes(status)) {
      res.status(400).json({ message: "Status must be ACTIVE or INACTIVE" });
      return;
    }

    const userRef = db.collection("users").doc(adminId);
    const snap = await userRef.get();
    if (!snap.exists) {
      res.status(404).json({ message: "Admin not found" });
      return;
    }

    await userRef.update({
      status,
      updatedAt: new Date().toISOString(),
    });

    res.json({ message: `Admin status updated to ${status}` });
  } catch (error) {
    next(error);
  }
});

router.patch("/admins/:adminId/password", requireAuth, async (req, res, next) => {
  try {
    if (req.authUser?.role !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Only Super Admin can reset administrator passwords" });
      return;
    }

    const adminId = String(req.params.adminId || "");
    const password = String(req.body?.password || "");
    if (!password || password.length < 6) {
      res.status(400).json({ message: "Password must be at least 6 characters long" });
      return;
    }

    const userRef = db.collection("users").doc(adminId);
    const snap = await userRef.get();
    if (!snap.exists) {
      res.status(404).json({ message: "Administrator account not found" });
      return;
    }

    const data = snap.data();
    const firebaseUid = data?.firebaseUid || adminId;

    await firebaseAuth.updateUser(firebaseUid, { password });

    await writeAuditLog({
      actorId: req.authUser.id,
      action: "RESET_ADMIN_PASSWORD",
      entityType: "USER",
      entityId: adminId,
    });

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    next(error);
  }
});

router.delete("/admins/:adminId", requireAuth, async (req, res, next) => {
  try {
    if (req.authUser?.role !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Only Super Admin can delete admins" });
      return;
    }

    const adminId = String(req.params.adminId || "");
    if (!adminId) {
      res.status(400).json({ message: "Invalid admin ID" });
      return;
    }
    if (adminId === req.authUser.id) {
      res.status(400).json({ message: "You cannot delete your own Super Admin account" });
      return;
    }

    const userRef = db.collection("users").doc(adminId);
    const snap = await userRef.get();
    if (!snap.exists) {
      res.status(404).json({ message: "Admin not found" });
      return;
    }

    const data = snap.data();
    const firebaseUid = data?.firebaseUid || adminId;

    // Delete hostel admin assignments
    const assignmentsSnap = await db
      .collection("hostelAdmins")
      .where("adminId", "==", adminId)
      .get();

    const batch = db.batch();
    assignmentsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(userRef);
    await batch.commit();

    try {
      await firebaseAuth.deleteUser(firebaseUid);
    } catch (fbErr) {
      console.warn("Firebase Auth deletion warning:", fbErr);
    }

    await writeAuditLog({
      actorId: req.authUser.id,
      action: "DELETE_ADMIN",
      entityType: "USER",
      entityId: adminId,
    });

    res.json({ message: "Admin removed successfully" });
  } catch (error) {
    next(error);
  }
});

router.get("/super-admin/system-status", requireAuth, async (req, res, next) => {
  try {
    if (req.authUser?.role !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Only Super Admin can access technical system status" });
      return;
    }

    const telemetry = await getSystemTelemetry();
    res.json(telemetry);
  } catch (error) {
    next(error);
  }
});

router.post("/super-admin/run-diagnostics", requireAuth, async (req, res, next) => {
  try {
    if (req.authUser?.role !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Only Super Admin can run diagnostics" });
      return;
    }

    const diagnosticResult = await runDeepDiagnostics();
    res.json(diagnosticResult);
  } catch (error) {
    next(error);
  }
});

router.get("/super-admin/audit-logs", requireAuth, async (req, res, next) => {
  try {
    if (req.authUser?.role !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Only Super Admin can access security audit logs" });
      return;
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 5), 100);
    const logs = await getSecurityAuditLogs(limit);
    res.json({ logs });
  } catch (error) {
    next(error);
  }
});

router.post("/super-admin/clear-cache", requireAuth, async (req, res, next) => {
  try {
    if (req.authUser?.role !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Only Super Admin can flush cache" });
      return;
    }

    invalidateHostelAccessCache();

    res.json({
      message: "Server cache invalidated successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/super-admin/platform-overview", requireAuth, async (req, res, next) => {
  try {
    if (req.authUser?.role !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    // Return ONLY administrator counts — no business/hostel data
    const usersSnap = await db.collection("users").get();
    const admins = usersSnap.docs.filter((d) => {
      const r = d.data().role;
      return r === "ADMIN" || r === "SUPER_ADMIN";
    });

    res.json({
      totalAdmins: admins.length,
      activeAdmins: admins.filter((a) => a.data().status === "ACTIVE").length,
      inactiveAdmins: admins.filter((a) => a.data().status !== "ACTIVE").length,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/super-admin/system-logs", requireAuth, async (req, res, next) => {
  try {
    if (req.authUser?.role !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Only Super Admin can access system error logs" });
      return;
    }

    const level = typeof req.query.level === "string" ? req.query.level : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 5), 100);
    const logs = getSystemLogs(level, limit);
    res.json({ logs });
  } catch (error) {
    next(error);
  }
});

router.delete("/super-admin/system-logs", requireAuth, async (req, res, next) => {
  try {
    if (req.authUser?.role !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Only Super Admin can clear system error logs" });
      return;
    }

    clearSystemLogs();
    res.json({ message: "System logs buffer cleared successfully" });
  } catch (error) {
    next(error);
  }
});

router.get("/super-admin/platform-config", requireAuth, async (req, res, next) => {
  try {
    if (req.authUser?.role !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Only Super Admin can view platform configuration" });
      return;
    }

    res.json(getPlatformConfig());
  } catch (error) {
    next(error);
  }
});

router.patch("/super-admin/platform-config", requireAuth, async (req, res, next) => {
  try {
    if (req.authUser?.role !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Only Super Admin can update platform configuration" });
      return;
    }

    const updated = await updatePlatformConfig(req.body, req.authUser.email || "Super Admin");
    await writeAuditLog({
      actorId: req.authUser.id,
      action: "UPDATE_PLATFORM_CONFIG",
      entityType: "SYSTEM",
      metadata: req.body,
    });

    res.json({ message: "Platform configuration updated successfully", config: updated });
  } catch (error) {
    next(error);
  }
});

const changePasswordSchema = z.object({
  password: z.string().min(6).max(128),
});

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: "Password must be at least 6 characters long",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const firebaseUid = req.authUser!.firebaseUid;
    if (!firebaseUid) {
      res.status(400).json({ message: "Invalid user account" });
      return;
    }

    await firebaseAuth.updateUser(firebaseUid, {
      password: parsed.data.password,
    });

    await writeAuditLog({
      actorId: req.authUser!.id,
      action: "CHANGE_PASSWORD",
      entityType: "USER",
      entityId: req.authUser!.id,
    });

    res.json({
      message: "Password updated successfully. You can now use this password to sign in.",
    });
  } catch (error) {
    next(error);
  }
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "A valid email is required" });
      return;
    }

    const email = parsed.data.email.toLowerCase().trim();
    let userRecord: import("firebase-admin/auth").UserRecord | null = null;
    let displayName = "Resident";

    try {
      userRecord = await firebaseAuth.getUserByEmail(email);
      if (userRecord?.displayName) displayName = userRecord.displayName;
    } catch {
      // Check Firestore renters collection if not in Auth directly
      const renterSnap = await db.collection("renters").where("email", "==", email).limit(1).get();
      const firstDoc = renterSnap.docs[0];
      if (firstDoc) {
        const rData = firstDoc.data();
        displayName = rData.name || rData.fullName || "Resident";
        if (rData.userId) {
          try {
            userRecord = await firebaseAuth.getUser(rData.userId);
          } catch {}
        }
      }
    }

    if (!userRecord) {
      // Return 200 to prevent user enumeration
      res.json({
        message: "If your email is registered, your new password has been sent to your inbox.",
      });
      return;
    }

    // Generate secure temporary password: Nexa@ + 6 alphanumeric
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let randomPart = "";
    for (let i = 0; i < 6; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const newPassword = `Nexa@${randomPart}`;

    // Update password in Firebase Auth
    await firebaseAuth.updateUser(userRecord.uid, {
      password: newPassword,
    });

    // Send email to renter with new password
    await sendPasswordEmail(email, newPassword, displayName);

    await writeAuditLog({
      actorId: userRecord.uid,
      action: "RESET_PASSWORD",
      entityType: "USER",
      entityId: userRecord.uid,
    });

    res.json({
      message: "A new password has been sent to your registered email address.",
    });
  } catch (error) {
    next(error);
  }
});

// Resolve email from email OR mobile number
router.post("/login-lookup", async (req, res, next) => {
  try {
    const { identifier } = req.body;
    if (!identifier || typeof identifier !== "string") {
      res.status(400).json({ message: "Identifier is required" });
      return;
    }
    const clean = identifier.trim();

    // 1. Try finding by email
    if (clean.includes("@")) {
      const emailSnap = await db
        .collection("users")
        .where("email", "==", clean.toLowerCase())
        .limit(1)
        .get();
      if (!emailSnap.empty && emailSnap.docs[0]) {
        const u = emailSnap.docs[0].data();
        res.json({
          found: true,
          email: u.email,
          phone: u.phone,
          role: u.role,
        });
        return;
      }
    }

    // 2. Try finding by phone number
    const digitsOnly = clean.replace(/\D/g, "");
    const candidatePhones = Array.from(new Set([
      clean,
      digitsOnly,
      digitsOnly.length >= 10 ? `+91${digitsOnly.slice(-10)}` : "",
      digitsOnly.length >= 10 ? digitsOnly.slice(-10) : "",
    ])).filter(Boolean);

    for (const p of candidatePhones) {
      const phoneSnap = await db
        .collection("users")
        .where("phone", "==", p)
        .limit(1)
        .get();
      if (!phoneSnap.empty && phoneSnap.docs[0]) {
        const u = phoneSnap.docs[0].data();
        res.json({
          found: true,
          email: u.email,
          phone: u.phone,
          role: u.role,
        });
        return;
      }
    }

    // 3. Also check repairPersons collection
    for (const p of candidatePhones) {
      const rpSnap = await db
        .collection("repairPersons")
        .where("phone", "==", p)
        .limit(1)
        .get();
      if (!rpSnap.empty && rpSnap.docs[0]) {
        const rp = rpSnap.docs[0].data();
        res.json({
          found: true,
          email: rp.email,
          phone: rp.phone,
          role: "REPAIR_PERSON",
        });
        return;
      }
    }

    res.status(404).json({ message: "No account found with this email or mobile number" });
  } catch (error) {
    next(error);
  }
});

// Repair login helper with Firebase custom token
router.post("/repair-login", async (req, res, next) => {
  try {
    const { identifier } = req.body;
    if (!identifier || typeof identifier !== "string") {
      res.status(400).json({ message: "Email or mobile number is required" });
      return;
    }
    const clean = identifier.trim();
    let email = clean.toLowerCase();

    if (!clean.includes("@")) {
      const digitsOnly = clean.replace(/\D/g, "");
      const candidatePhones = Array.from(new Set([
        clean,
        digitsOnly,
        digitsOnly.length >= 10 ? `+91${digitsOnly.slice(-10)}` : "",
        digitsOnly.length >= 10 ? digitsOnly.slice(-10) : "",
      ])).filter(Boolean);

      let found = false;
      for (const p of candidatePhones) {
        const snap = await db
          .collection("users")
          .where("phone", "==", p)
          .limit(1)
          .get();
        if (!snap.empty && snap.docs[0]) {
          email = String(snap.docs[0].data().email || "");
          found = true;
          break;
        }
      }

      if (!found) {
        for (const p of candidatePhones) {
          const snap = await db
            .collection("repairPersons")
            .where("phone", "==", p)
            .limit(1)
            .get();
          if (!snap.empty && snap.docs[0]) {
            email = String(snap.docs[0].data().email || "");
            found = true;
            break;
          }
        }
      }

      if (!found) {
        res.status(404).json({ message: "No repair account found with this mobile number" });
        return;
      }
    }

    const userDocSnap = await db
      .collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();

    const userDoc = userDocSnap.docs[0];
    if (!userDoc || !userDoc.exists) {
      res.status(404).json({ message: "User account not found" });
      return;
    }

    const userData = userDoc.data();
    const customToken = await firebaseAuth.createCustomToken(userDoc.id);

    res.json({
      message: "Lookup successful",
      email,
      customToken,
      user: {
        id: userDoc.id,
        ...userData,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
