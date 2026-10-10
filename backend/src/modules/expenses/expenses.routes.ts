import { Router } from "express";
import { z } from "zod";
import { db } from "../../config/firebase.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireHostelAccess } from "../../middleware/hostel-access.middleware.js";
import { writeAuditLog } from "../../utils/audit.js";

const router = Router();

export const EXPENSE_CATEGORIES = [
  "ELECTRICITY",
  "WATER",
  "SALARY",
  "INTERNET",
  "MAINTENANCE",
  "FOOD_MESS",
  "CLEANING",
  "RENT_LEASE",
  "OTHER",
] as const;

const createExpenseSchema = z.object({
  title: z.string().trim().min(2).max(120),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
  notes: z.string().trim().max(1000).optional(),
  receiptUploadId: z.string().trim().optional(),
  receiptUrl: z.string().trim().url().optional(),
});

// ── GET /:hostelId/expenses ──────────────────────────────────────────────────
router.get(
  "/:hostelId/expenses",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      const hostelId = req.params.hostelId as string;
      const month = typeof req.query.month === "string" ? req.query.month : null; // YYYY-MM
      const category = typeof req.query.category === "string" ? req.query.category : null;

      let query: FirebaseFirestore.Query = db
        .collection("expenses")
        .where("hostelId", "==", hostelId);

      if (category && (EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
        query = query.where("category", "==", category);
      }

      const snapshot = await query.get();
      let expenses = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          hostelId: data.hostelId,
          title: data.title,
          category: data.category,
          amount: Number(data.amount || 0),
          date: data.date,
          notes: data.notes || "",
          receiptUploadId: data.receiptUploadId || null,
          receiptUrl: data.receiptUrl || null,
          createdBy: data.createdBy || null,
          createdAt: data.createdAt || "",
        };
      });

      // Filter by month in memory (to avoid composite index requirement)
      if (month && /^\d{4}-\d{2}$/.test(month)) {
        expenses = expenses.filter((e) => String(e.date).slice(0, 7) === month);
      }

      expenses.sort((a, b) => b.date.localeCompare(a.date));

      res.json({ expenses });
    } catch (error) {
      next(error);
    }
  },
);

// ── POST /:hostelId/expenses ─────────────────────────────────────────────────
router.post(
  "/:hostelId/expenses",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (req.authUser?.role !== "SUPER_ADMIN" && req.authUser?.role !== "ADMIN") {
        res.status(403).json({ message: "Only Admin can record hostel expenses" });
        return;
      }

      const hostelId = req.params.hostelId as string;
      const parsed = createExpenseSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          message: "Invalid expense data",
          errors: parsed.error.flatten(),
        });
        return;
      }

      const now = new Date().toISOString();
      const expenseRef = db.collection("expenses").doc();

      const expense = {
        id: expenseRef.id,
        hostelId,
        title: parsed.data.title,
        category: parsed.data.category,
        amount: parsed.data.amount,
        date: parsed.data.date,
        notes: parsed.data.notes || null,
        receiptUploadId: parsed.data.receiptUploadId || null,
        receiptUrl: parsed.data.receiptUrl || null,
        createdBy: req.authUser.id,
        createdAt: now,
        updatedAt: now,
      };

      await expenseRef.set(expense);

      await writeAuditLog({
        actorId: req.authUser.id,
        action: "CREATE_EXPENSE",
        entityType: "EXPENSE",
        entityId: expenseRef.id,
        metadata: {
          title: parsed.data.title,
          amount: parsed.data.amount,
          category: parsed.data.category,
          hostelId,
        },
      });

      res.status(201).json({
        message: "Expense recorded successfully",
        expense,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── DELETE /:hostelId/expenses/:expenseId ────────────────────────────────────
router.delete(
  "/:hostelId/expenses/:expenseId",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      if (req.authUser?.role !== "SUPER_ADMIN" && req.authUser?.role !== "ADMIN") {
        res.status(403).json({ message: "Only Admin can delete hostel expenses" });
        return;
      }

      const hostelId = req.params.hostelId as string;
      const expenseId = req.params.expenseId as string;
      const expenseRef = db.collection("expenses").doc(expenseId);
      const expenseDoc = await expenseRef.get();

      if (!expenseDoc.exists || expenseDoc.data()?.hostelId !== hostelId) {
        res.status(404).json({ message: "Expense record not found" });
        return;
      }

      await expenseRef.delete();

      await writeAuditLog({
        actorId: req.authUser.id,
        action: "DELETE_EXPENSE",
        entityType: "EXPENSE",
        entityId: expenseId,
        metadata: { hostelId },
      });

      res.json({ message: "Expense deleted successfully", expenseId });
    } catch (error) {
      next(error);
    }
  },
);

// ── GET /:hostelId/financial-summary ─────────────────────────────────────────
router.get(
  "/:hostelId/financial-summary",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      const hostelId = req.params.hostelId as string;
      const targetMonth =
        typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)
          ? req.query.month
          : new Date().toISOString().slice(0, 7);

      const [paymentsSnap, expensesSnap, feesSnap] = await Promise.all([
        db.collection("payments").where("hostelId", "==", hostelId).get(),
        db.collection("expenses").where("hostelId", "==", hostelId).get(),
        db.collection("fees").where("hostelId", "==", hostelId).get(),
      ]);

      // Calculate approved collection for the month
      let totalIncome = 0;
      paymentsSnap.docs.forEach((doc) => {
        const p = doc.data();
        const pStatus = String(p.status || "APPROVED").toUpperCase();
        if (pStatus !== "APPROVED") return;
        const pDate = String(p.paymentDate || p.submittedAt || p.createdAt || "").slice(0, 7);
        if (pDate === targetMonth) {
          totalIncome += Number(p.amount || 0);
        }
      });

      // Calculate expenses for the month and breakdown by category
      let totalExpenses = 0;
      const categoryBreakdown: Record<string, number> = {};
      EXPENSE_CATEGORIES.forEach((cat) => {
        categoryBreakdown[cat] = 0;
      });

      const monthExpenses: any[] = [];
      expensesSnap.docs.forEach((doc) => {
        const e = doc.data();
        const eDate = String(e.date || e.createdAt || "").slice(0, 7);
        if (eDate === targetMonth) {
          const amt = Number(e.amount || 0);
          totalExpenses += amt;
          const cat = e.category || "OTHER";
          categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + amt;
          monthExpenses.push({ id: doc.id, ...e, amount: amt });
        }
      });

      monthExpenses.sort((a, b) => String(b.date).localeCompare(String(a.date)));

      // Calculate pending dues for the month
      let pendingDues = 0;
      feesSnap.docs.forEach((doc) => {
        const f = doc.data();
        const fMonth = String(f.month || "");
        if (fMonth === targetMonth || String(f.dueDate || "").slice(0, 7) === targetMonth) {
          const rem = Math.max(0, Number(f.amount || 0) - Number(f.paidAmount || 0));
          if (f.status === "PENDING" || f.status === "PARTIALLY_PAID" || f.status === "OVERDUE") {
            pendingDues += rem;
          }
        }
      });

      const netProfit = totalIncome - totalExpenses;
      const profitMargin = totalIncome > 0 ? Math.round((netProfit / totalIncome) * 100) : 0;

      // 6-month historical trend
      const monthlyTrend: Array<{
        month: string;
        label: string;
        income: number;
        expenses: number;
        profit: number;
      }> = [];

      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleString("en-US", { month: "short" });

        let mIncome = 0;
        let mExpense = 0;

        paymentsSnap.docs.forEach((pDoc) => {
          const p = pDoc.data();
          if (String(p.status || "APPROVED").toUpperCase() !== "APPROVED") return;
          if (String(p.paymentDate || p.submittedAt || p.createdAt || "").slice(0, 7) === mKey) {
            mIncome += Number(p.amount || 0);
          }
        });

        expensesSnap.docs.forEach((eDoc) => {
          const e = eDoc.data();
          if (String(e.date || e.createdAt || "").slice(0, 7) === mKey) {
            mExpense += Number(e.amount || 0);
          }
        });

        monthlyTrend.push({
          month: mKey,
          label,
          income: mIncome,
          expenses: mExpense,
          profit: mIncome - mExpense,
        });
      }

      res.json({
        summary: {
          month: targetMonth,
          totalIncome,
          totalExpenses,
          netProfit,
          profitMargin,
          pendingDues,
          categoryBreakdown,
          recentExpenses: monthExpenses.slice(0, 10),
          monthlyTrend,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── GET /:hostelId/financial-export (CSV for Accountants & Excel) ─────────────
router.get(
  "/:hostelId/financial-export",
  requireAuth,
  requireHostelAccess,
  async (req, res, next) => {
    try {
      const hostelId = req.params.hostelId as string;
      const month = typeof req.query.month === "string" ? req.query.month : null;

      const [hostelDoc, paymentsSnap, expensesSnap] = await Promise.all([
        db.collection("hostels").doc(hostelId).get(),
        db.collection("payments").where("hostelId", "==", hostelId).get(),
        db.collection("expenses").where("hostelId", "==", hostelId).get(),
      ]);

      const hostelName = hostelDoc.data()?.name || "Hostel";
      const rows: Array<{
        date: string;
        type: "INCOME" | "EXPENSE";
        category: string;
        title: string;
        amount: number;
        reference: string;
      }> = [];

      // Add payments (Income)
      paymentsSnap.docs.forEach((doc) => {
        const p = doc.data();
        if (String(p.status || "APPROVED").toUpperCase() !== "APPROVED") return;
        const d = String(p.paymentDate || p.submittedAt || p.createdAt || "").slice(0, 10);
        if (month && d.slice(0, 7) !== month) return;
        rows.push({
          date: d,
          type: "INCOME",
          category: "Rent Fee Payment",
          title: `Rent collection (Ref: ${p.reference || doc.id})`,
          amount: Number(p.amount || 0),
          reference: String(p.reference || doc.id),
        });
      });

      // Add expenses
      expensesSnap.docs.forEach((doc) => {
        const e = doc.data();
        const d = String(e.date || "").slice(0, 10);
        if (month && d.slice(0, 7) !== month) return;
        rows.push({
          date: d,
          type: "EXPENSE",
          category: String(e.category || "OTHER"),
          title: String(e.title || "Hostel Expense").replace(/,/g, " "),
          amount: Number(e.amount || 0),
          reference: String(e.notes || "").replace(/,/g, " "),
        });
      });

      rows.sort((a, b) => b.date.localeCompare(a.date));

      // Build CSV output
      let csvContent = `HOSTELLA FINANCIAL LEDGER - ${hostelName.toUpperCase()}\n`;
      csvContent += `Generated: ${new Date().toISOString().slice(0, 10)}, Period: ${month || "All Time"}\n\n`;
      csvContent += "Date,Transaction Type,Category,Description / Title,Amount (INR),Reference / Notes\n";

      let sumIncome = 0;
      let sumExpense = 0;

      rows.forEach((r) => {
        if (r.type === "INCOME") sumIncome += r.amount;
        if (r.type === "EXPENSE") sumExpense += r.amount;
        csvContent += `"${r.date}","${r.type}","${r.category}","${r.title}",${r.amount},"${r.reference}"\n`;
      });

      csvContent += `\n"SUMMARY","TOTAL INCOME",,"",${sumIncome},""\n`;
      csvContent += `"SUMMARY","TOTAL EXPENSES",,"",${sumExpense},""\n`;
      csvContent += `"SUMMARY","NET PROFIT",,"",${sumIncome - sumExpense},""\n`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Hostella_${hostelName}_Financial_${month || "Report"}.csv"`,
      );
      res.status(200).send(csvContent);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
