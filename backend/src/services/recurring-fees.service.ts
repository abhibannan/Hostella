import { db } from "../config/firebase.js";
import { createNotification } from "../modules/notifications/notifications.server.js";
import { writeAuditLog } from "../utils/audit.js";

function getCreatedAtIso(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof (val as any).toDate === "function") {
    return (val as any).toDate().toISOString();
  }
  if (typeof (val as any).seconds === "number") {
    return new Date((val as any).seconds * 1000).toISOString();
  }
  return "";
}

/**
 * Service to handle recurring monthly fees and automatic rent notifications
 * based on renter's recurring due date.
 */
export async function checkAndProcessRecurringFees(): Promise<{
  createdFees: number;
  notificationsSent: number;
  markedOverdue: number;
}> {
  let createdFees = 0;
  let notificationsSent = 0;
  let markedOverdue = 0;

  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth() + 1; // 1-12
    const currentMonthStr = `${currentYear}-${String(currentMonthNum).padStart(2, "0")}`;
    const currentDateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const currentDay = now.getDate();

    // Query all active renters
    const rentersSnapshot = await db
      .collection("renters")
      .where("status", "==", "ACTIVE")
      .get();

    if (rentersSnapshot.empty) {
      return { createdFees, notificationsSent, markedOverdue };
    }

    for (const renterDoc of rentersSnapshot.docs) {
      const renter = renterDoc.data();
      const renterId = renterDoc.id;
      const hostelId = renter.hostelId;
      const userId = renter.userId;
      const monthlyFee = Number(renter.monthlyFee || 0);

      if (!hostelId || !userId || monthlyFee <= 0) continue;

      // Determine recurring due day from dueDay or joiningDate
      let dueDay = 1;
      if (typeof renter.dueDay === "number" && renter.dueDay >= 1 && renter.dueDay <= 31) {
        dueDay = renter.dueDay;
      } else if (renter.joiningDate && typeof renter.joiningDate === "string") {
        const parts = renter.joiningDate.split("-");
        if (parts.length === 3 && parts[2]) {
          const parsed = parseInt(parts[2], 10);
          if (!isNaN(parsed) && parsed >= 1 && parsed <= 31) {
            dueDay = parsed;
          }
        }
      }

      // Calculate days in the current month to avoid invalid dates (e.g. Feb 30)
      const daysInCurrentMonth = new Date(currentYear, currentMonthNum, 0).getDate();
      const safeDay = Math.min(dueDay, daysInCurrentMonth);
      const feeDueDate = `${currentYear}-${String(currentMonthNum).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;

      // Check if fee already exists for this renter in the current month
      const existingFeeSnapshot = await db
        .collection("fees")
        .where("hostelId", "==", hostelId)
        .where("renterId", "==", renterId)
        .where("month", "==", currentMonthStr)
        .limit(1)
        .get();

      let currentFeeId: string | null = null;
      let feeStatus = "PENDING";
      let feeAmount = monthlyFee;

      if (existingFeeSnapshot.empty) {
        // Create the recurring fee record for this month
        const newFeeRef = db.collection("fees").doc();
        currentFeeId = newFeeRef.id;

        const feeData = {
          id: currentFeeId,
          hostelId,
          renterId,
          month: currentMonthStr,
          amount: monthlyFee,
          paidAmount: 0,
          dueDate: feeDueDate,
          description: `Recurring monthly fee for ${currentMonthStr}`,
          status: "PENDING",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };

        await newFeeRef.set(feeData);
        createdFees++;

        await writeAuditLog({
          actorId: "SYSTEM_RECURRING_CRON",
          action: "CREATE_FEE",
          entityType: "FEE",
          entityId: currentFeeId,
          metadata: {
            hostelId,
            renterId,
            month: currentMonthStr,
            amount: monthlyFee,
            recurring: true,
          },
        });

        // Send automated notification: New Fee Generated / Due soon
        try {
          await createNotification({
            userId,
            type: "FEE_DUE",
            title: "Rent Fee Generated",
            message: `Your rent fee of ₹${Number(monthlyFee).toLocaleString("en-IN")} for ${currentMonthStr} has been generated. Due date: ${feeDueDate}.`,
            hostelId,
            entityType: "fee",
            entityId: currentFeeId,
          });
          notificationsSent++;
        } catch (notifErr) {
          console.error(`Failed to send FEE_DUE notification to user ${userId}:`, notifErr);
        }
      } else {
        const feeDoc = existingFeeSnapshot.docs[0];
        if (!feeDoc) continue;
        currentFeeId = feeDoc.id;
        const feeData = feeDoc.data();
        feeStatus = feeData.status || "PENDING";
        feeAmount = Number(feeData.amount || monthlyFee) - Number(feeData.paidAmount || 0);

        const effectiveDueDateStr = feeData.dueDate || feeDueDate;
        const dueDateObj = new Date(`${effectiveDueDateStr}T00:00:00`);
        const todayObj = new Date(`${currentDateStr}T00:00:00`);
        const diffDays = Math.round((dueDateObj.getTime() - todayObj.getTime()) / (1000 * 60 * 60 * 24));


        // If the fee is already overdue, mark it as OVERDUE
        if (
          (feeStatus === "PENDING" || feeStatus === "PARTIALLY_PAID" || feeStatus === "OVERDUE") &&
          diffDays < 0
        ) {
          if (feeStatus === "PENDING") {
            await feeDoc.ref.update({
              status: "OVERDUE",
              updatedAt: now.toISOString(),
            });
            markedOverdue++;
          }
        }
      }
    }

    // Also process all fees in 'fees' collection (both recurring and custom) for 5-day reminder and overdue reminder
    const allFeesSnapshot = await db
      .collection("fees")
      .where("status", "in", ["PENDING", "PARTIALLY_PAID", "OVERDUE"])
      .get();

    for (const fDoc of allFeesSnapshot.docs) {
      const fData = fDoc.data();
      if (!fData.dueDate || !fData.renterId) continue;
      const remAmount = Math.max(0, Number(fData.amount || 0) - Number(fData.paidAmount || 0));
      if (remAmount <= 0) continue;

      const fDueObj = new Date(`${fData.dueDate}T00:00:00`);
      const fTodayObj = new Date(`${currentDateStr}T00:00:00`);
      const fDiff = Math.round((fDueObj.getTime() - fTodayObj.getTime()) / (1000 * 60 * 60 * 24));

      const rSnap = await db.collection("renters").doc(fData.renterId).get();
      if (!rSnap.exists) continue;
      const rData = rSnap.data();
      if (!rData?.userId) continue;

      const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();

      // Case 1: Overdue fee (after due date and still unpaid) -> send daily overdue notification
      if (fDiff < 0) {
        if (fData.status === "PENDING") {
          await fDoc.ref.update({
            status: "OVERDUE",
            updatedAt: now.toISOString(),
          });
          markedOverdue++;
        }

        const overdueSnap = await db
          .collection("notifications")
          .where("userId", "==", rData.userId)
          .where("type", "==", "FEE_OVERDUE")
          .where("entityId", "==", fDoc.id)
          .limit(10)
          .get();

        const alreadySentOverdue = overdueSnap.docs.some(
          (d) => getCreatedAtIso(d.data().createdAt) >= twentyHoursAgo,
        );
        if (!alreadySentOverdue) {
          const daysOverdue = Math.abs(fDiff);
          const overdueNotice = daysOverdue === 1
            ? `was due yesterday (${fData.dueDate})`
            : `is overdue by ${daysOverdue} days (Due date: ${fData.dueDate})`;

          try {
            await createNotification({
              userId: rData.userId,
              type: "FEE_OVERDUE",
              title: "Fee Payment Overdue!",
              message: `Your fee of ₹${remAmount.toLocaleString("en-IN")} ${overdueNotice}. Please clear your dues immediately.`,
              hostelId: fData.hostelId || rData.hostelId,
              entityType: "fee",
              entityId: fDoc.id,
            });
            notificationsSent++;
          } catch (e) {
            console.error(`Failed to send automated overdue fee notification to ${rData.userId}:`, e);
          }
        }
      }
      // Case 2: Within 5 days before due date -> send daily due reminder
      else if (fDiff >= 0 && fDiff <= 5) {
        const existingSnap = await db
          .collection("notifications")
          .where("userId", "==", rData.userId)
          .where("type", "==", "FEE_DUE")
          .where("entityId", "==", fDoc.id)
          .limit(10)
          .get();

        const alreadySentDue = existingSnap.docs.some(
          (d) => getCreatedAtIso(d.data().createdAt) >= twentyHoursAgo,
        );
        if (!alreadySentDue) {
          const dueNotice = fDiff === 0
            ? "is due today!"
            : fDiff === 1
            ? `is due tomorrow (${fData.dueDate})`
            : `is due in ${fDiff} days (${fData.dueDate})`;

          try {
            await createNotification({
              userId: rData.userId,
              type: "FEE_DUE",
              title: fDiff === 0 ? "Fee Due Today!" : "Fee Payment Reminder",
              message: `Your fee of ₹${remAmount.toLocaleString("en-IN")} ${dueNotice}. Please pay on time.`,
              hostelId: fData.hostelId || rData.hostelId,
              entityType: "fee",
              entityId: fDoc.id,
            });
            notificationsSent++;
          } catch (e) {
            console.error(`Failed to send 5-day automated fee reminder to ${rData.userId}:`, e);
          }
        }
      }
    }

    console.log(
      `[Recurring Fees Processed] Created: ${createdFees}, Notifications: ${notificationsSent}, Marked Overdue: ${markedOverdue}`,
    );
  } catch (error) {
    console.error("Error in checkAndProcessRecurringFees:", error);
  }

  return { createdFees, notificationsSent, markedOverdue };
}

/**
 * Initializes the automated recurring fee runner
 */
export function startRecurringFeesCron() {
  // Run 10 seconds after server starts
  setTimeout(() => {
    void checkAndProcessRecurringFees();
  }, 10000);

  // Then run every 6 hours
  const INTERVAL_MS = 6 * 60 * 60 * 1000;
  setInterval(() => {
    void checkAndProcessRecurringFees();
  }, INTERVAL_MS);

  console.log("Recurring monthly fee & notification scheduler initialized.");
}
