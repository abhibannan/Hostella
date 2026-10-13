import { Router } from "express";
import { db } from "../../config/firebase.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireHostelAccess } from "../../middleware/hostel-access.middleware.js";
import { registerCacheInvalidator } from "../../utils/cache.js";

const router = Router();

type DashboardStats = {
  hostelId?: string;

  totalRooms: number;
  activeRooms: number;
  availableRooms: number;
  occupiedRooms: number;

  activeRenters: number;

  totalFees: number;
  paidFees: number;
  outstandingFees: number;
  pendingFees: number;
  partiallyPaidFees: number;
  overdueFees: number;

  totalPayments: number;
  paidPayments: number;
  pendingPayments: number;

  totalRepairRequests: number;
  submittedRepairs: number;
  inProgressRepairs: number;
  resolvedRepairs: number;
  cancelledRepairs: number;
};

function emptyStats(
  hostelId?: string,
): DashboardStats {
  return {
    ...(hostelId ? { hostelId } : {}),

    totalRooms: 0,
    activeRooms: 0,
    availableRooms: 0,
    occupiedRooms: 0,

    activeRenters: 0,

    totalFees: 0,
    paidFees: 0,
    outstandingFees: 0,
    pendingFees: 0,
    partiallyPaidFees: 0,
    overdueFees: 0,

    totalPayments: 0,
    paidPayments: 0,
    pendingPayments: 0,

    totalRepairRequests: 0,
    submittedRepairs: 0,
    inProgressRepairs: 0,
    resolvedRepairs: 0,
    cancelledRepairs: 0,
  };
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const dashboardStatsCache = new Map<string, CacheEntry<DashboardStats>>();
const CACHE_TTL_MS = 60000; // 60s in-memory cache to absorb polling bursts and speed up responses

export function invalidateDashboardCache(hostelId?: string) {
  if (hostelId) {
    dashboardStatsCache.delete(hostelId);
    dashboardStatsCache.delete("__all__");
  } else {
    dashboardStatsCache.clear();
  }
}
registerCacheInvalidator(invalidateDashboardCache);

export function computeDashboardFromDocs(
  hostelId: string | undefined,
  roomsDocs: FirebaseFirestore.DocumentData[],
  rentersDocs: FirebaseFirestore.DocumentData[],
  feesDocs: FirebaseFirestore.DocumentData[],
  paymentsDocs: FirebaseFirestore.DocumentData[],
  repairsDocs: FirebaseFirestore.DocumentData[],
): DashboardStats {
  const stats = emptyStats(hostelId);

  stats.totalRooms = roomsDocs.length;

  const roomIds = new Set<string>();
  const activeRoomIds = new Set<string>();

  roomsDocs.forEach((doc) => {
    const data = typeof doc.data === "function" ? doc.data() : doc;
    const id = doc.id || data.id;
    if (id) roomIds.add(String(id));
    const status = String(data.status || "ACTIVE").toUpperCase();
    if (status === "ACTIVE") {
      stats.activeRooms += 1;
    }
  });

  rentersDocs.forEach((doc) => {
    const data = typeof doc.data === "function" ? doc.data() : doc;
    const status = String(data.status || "ACTIVE").toUpperCase();

    if (status === "ACTIVE") {
      stats.activeRenters += 1;

      if (data.roomId && roomIds.has(String(data.roomId))) {
        activeRoomIds.add(String(data.roomId));
      }
    }
  });

  stats.occupiedRooms = activeRoomIds.size;
  stats.availableRooms = Math.max(stats.totalRooms - stats.occupiedRooms, 0);

  feesDocs.forEach((doc) => {
    const data = typeof doc.data === "function" ? doc.data() : doc;

    const amount = Number(data.amount ?? 0);
    const paidAmount = Number(data.paidAmount ?? 0);

    stats.totalFees += amount;
    stats.outstandingFees += Math.max(amount - paidAmount, 0);

    const status = String(data.status ?? "").toUpperCase();

    if (status === "PAID") {
      stats.paidFees += 1;
    } else if (status === "PENDING") {
      stats.pendingFees += 1;
    } else if (status === "PARTIALLY_PAID") {
      stats.partiallyPaidFees += 1;
    } else if (status === "OVERDUE") {
      stats.overdueFees += 1;
    }
  });

  paymentsDocs.forEach((doc) => {
    const data = typeof doc.data === "function" ? doc.data() : doc;
    const status = String(data.status ?? "").toUpperCase();

    stats.totalPayments += 1;

    if (status === "PAID" || status === "APPROVED") {
      stats.paidPayments += 1;
    } else if (status === "PENDING" || status === "SUBMITTED") {
      stats.pendingPayments += 1;
    }
  });

  repairsDocs.forEach((doc) => {
    const data = typeof doc.data === "function" ? doc.data() : doc;
    const status = String(data.status ?? "").toUpperCase();

    stats.totalRepairRequests += 1;

    if (status === "SUBMITTED") {
      stats.submittedRepairs += 1;
    } else if (status === "IN_PROGRESS") {
      stats.inProgressRepairs += 1;
    } else if (status === "RESOLVED") {
      stats.resolvedRepairs += 1;
    } else if (status === "CANCELLED") {
      stats.cancelledRepairs += 1;
    }
  });

  return stats;
}

export { dashboardStatsCache };

export async function calculateDashboard(
  hostelId?: string,
): Promise<DashboardStats> {
  const cacheKey = hostelId || "__all__";
  const cached = dashboardStatsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  let roomsQuery = db.collection("rooms");
  let rentersQuery = db.collection("renters");
  let feesQuery = db.collection("fees");
  let paymentsQuery = db.collection("payments");
  let repairsQuery = db.collection("repairs");

  if (hostelId) {
    roomsQuery = roomsQuery.where(
      "hostelId",
      "==",
      hostelId,
    ) as FirebaseFirestore.CollectionReference;

    rentersQuery = rentersQuery.where(
      "hostelId",
      "==",
      hostelId,
    ) as FirebaseFirestore.CollectionReference;

    feesQuery = feesQuery.where(
      "hostelId",
      "==",
      hostelId,
    ) as FirebaseFirestore.CollectionReference;

    paymentsQuery = paymentsQuery.where(
      "hostelId",
      "==",
      hostelId,
    ) as FirebaseFirestore.CollectionReference;

    repairsQuery = repairsQuery.where(
      "hostelId",
      "==",
      hostelId,
    ) as FirebaseFirestore.CollectionReference;
  }

  const [
    roomsSnapshot,
    rentersSnapshot,
    feesSnapshot,
    paymentsSnapshot,
    repairsSnapshot,
  ] = await Promise.all([
    roomsQuery.get(),
    rentersQuery.get(),
    feesQuery.get(),
    paymentsQuery.get(),
    repairsQuery.get(),
  ]);

  const stats = computeDashboardFromDocs(
    hostelId,
    roomsSnapshot.docs,
    rentersSnapshot.docs,
    feesSnapshot.docs,
    paymentsSnapshot.docs,
    repairsSnapshot.docs,
  );

  dashboardStatsCache.set(cacheKey, { data: stats, timestamp: Date.now() });
  return stats;
}

// ---------------------------------------------------------
// ADMIN / SUPER ADMIN DASHBOARD
// ---------------------------------------------------------

router.get(
  "/",
  requireAuth,
  async (req, res, next) => {
    try {
      const role = req.authUser?.role;

      if (
        role !== "SUPER_ADMIN" &&
        role !== "ADMIN" &&
        role !== "PARTNER"
      ) {
        res.status(403).json({
          message: "Access denied",
        });
        return;
      }

      if (role === "PARTNER") {
        const [assignments, userDoc] = await Promise.all([
          db.collection("hostelPartners").where("userId", "==", req.authUser!.id).where("status", "==", "ACTIVE").get(),
          db.collection("users").doc(req.authUser!.id).get(),
        ]);

        const hostelIdSet = new Set<string>();
        assignments.docs.forEach((doc) => {
          const id = doc.data().hostelId;
          if (id) hostelIdSet.add(String(id));
        });
        const uData = userDoc.data();
        if (Array.isArray(uData?.hostelIds)) {
          uData.hostelIds.forEach((id: string) => hostelIdSet.add(id));
        }

        const hostelIds = Array.from(hostelIdSet);
        if (hostelIds.length === 0) {
          res.json({ dashboard: emptyStats() });
          return;
        }

        const stats = await calculateDashboard(hostelIds[0]);
        res.json({ dashboard: stats });
        return;
      }

      // ---------------------------------------------------
      // SUPER ADMIN
      // ---------------------------------------------------

      if (role === "SUPER_ADMIN") {
        // Super Admin manages technical infrastructure and admins only — no hostel metrics
        res.json({
          dashboard: {
            ...emptyStats(),
            hostelCount: 0,
            hostels: [],
          },
        });
        return;
      }

      // ---------------------------------------------------
      // ADMIN
      // ---------------------------------------------------

      const [assignments, ownedSnapshots] = await Promise.all([
        db
          .collection("hostelAdmins")
          .where("adminId", "==", req.authUser!.id)
          .get(),
        db
          .collection("hostels")
          .where("ownerId", "==", req.authUser!.id)
          .get(),
      ]);

      const hostelIdSet = new Set<string>();
      assignments.docs.forEach((doc) => {
        const id = String(doc.data().hostelId ?? doc.id);
        if (id) hostelIdSet.add(id);
      });
      ownedSnapshots.docs.forEach((doc) => {
        hostelIdSet.add(doc.id);
      });

      const hostelIds = Array.from(hostelIdSet);

      const hostelStats =
        await Promise.all(
          hostelIds.map((hostelId) =>
            calculateDashboard(
              hostelId,
            ),
          ),
        );

      const overall = emptyStats();

      hostelStats.forEach((stats) => {
        overall.totalRooms +=
          stats.totalRooms;
        overall.activeRooms +=
          stats.activeRooms;
        overall.availableRooms +=
          stats.availableRooms;
        overall.occupiedRooms +=
          stats.occupiedRooms;

        overall.activeRenters +=
          stats.activeRenters;

        overall.totalFees +=
          stats.totalFees;
        overall.paidFees +=
          stats.paidFees;
        overall.outstandingFees +=
          stats.outstandingFees;
        overall.pendingFees +=
          stats.pendingFees;
        overall.partiallyPaidFees +=
          stats.partiallyPaidFees;
        overall.overdueFees +=
          stats.overdueFees;

        overall.totalPayments +=
          stats.totalPayments;
        overall.paidPayments +=
          stats.paidPayments;
        overall.pendingPayments +=
          stats.pendingPayments;

        overall.totalRepairRequests +=
          stats.totalRepairRequests;
        overall.submittedRepairs +=
          stats.submittedRepairs;
        overall.inProgressRepairs +=
          stats.inProgressRepairs;
        overall.resolvedRepairs +=
          stats.resolvedRepairs;
        overall.cancelledRepairs +=
          stats.cancelledRepairs;
      });

      res.json({
        dashboard: {
          ...overall,
          hostelCount:
            hostelIds.length,
          hostels: hostelStats,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------
// DASHBOARD FOR ONE HOSTEL
// ---------------------------------------------------------

router.get(
  "/:hostelId",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (req.authUser?.role === "SUPER_ADMIN") {
        res.status(403).json({
          message: "Super Admin cannot access hostel business metrics",
        });
        return;
      }

      const hostelId = req.params.hostelId;
      if (typeof hostelId !== "string" || !hostelId.trim()) {
        res.status(400).json({
          message: "Invalid hostel ID",
        });
        return;
      }

      const dashboard = await calculateDashboard(hostelId);
      res.json({ dashboard });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
