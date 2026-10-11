import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";
import { Expense, Fee, Payment, Renter, Hostel, Dashboard } from "../types";
import { FinancialSummary } from "../hooks/useExpenseActions";
import { money } from "./formatters";

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const categoryLabels: Record<string, string> = {
  ELECTRICITY: "Electricity Bills",
  WATER: "Water Tankers",
  SALARY: "Staff Salaries",
  INTERNET: "Internet & WiFi",
  MAINTENANCE: "Repairs & Maintenance",
  FOOD: "Food & Mess Supplies",
  OTHER: "Other Operational Upkeep",
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function generatedOn(): string {
  return new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRenterName(renter: Renter): string {
  if (renter.name && renter.name.trim()) return renter.name.trim();
  if (renter.fullName && renter.fullName.trim()) return renter.fullName.trim();
  if (renter.user?.name && renter.user.name.trim()) return renter.user.name.trim();
  if (renter.user?.fullName && renter.user.fullName.trim()) return renter.user.fullName.trim();
  const first = renter.user?.firstName?.trim() || "";
  const last = renter.user?.lastName?.trim() || "";
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  if (renter.email && renter.email.trim()) return renter.email.trim();
  if (renter.user?.email && renter.user.email.trim()) return renter.user.email.trim();
  return "Resident";
}

function getRenterRoom(renter: Renter): string {
  return renter.room?.roomNumber || (renter as any).roomNumber || "—";
}

const CSS_BASE = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0F172A;
    background: #FFFFFF;
    padding: 32px;
    font-size: 13px;
    line-height: 1.5;
  }
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid #4F46E5;
    padding-bottom: 16px;
    margin-bottom: 24px;
  }
  .brand { font-size: 24px; font-weight: 900; color: #4F46E5; letter-spacing: -0.5px; }
  .brand-sub { font-size: 13px; color: #64748B; margin-top: 2px; }
  .hostel-name { font-size: 16px; font-weight: 800; color: #1E293B; margin-top: 4px; }
  .report-meta { text-align: right; font-size: 11px; color: #64748B; }
  .report-meta strong { color: #1E293B; }
  .kpi-grid { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
  .kpi-card {
    flex: 1;
    min-width: 120px;
    padding: 14px;
    border-radius: 10px;
    border: 1px solid #E2E8F0;
    background: #F8FAFC;
  }
  .kpi-card.green { background: #F0FDF4; border-color: #BBF7D0; }
  .kpi-card.red { background: #FEF2F2; border-color: #FECACA; }
  .kpi-card.amber { background: #FFFBEB; border-color: #FDE68A; }
  .kpi-card.indigo { background: #EEF2FF; border-color: #C7D2FE; }
  .kpi-label { font-size: 10px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; }
  .kpi-value { font-size: 20px; font-weight: 900; margin-top: 5px; }
  .kpi-sub { font-size: 10px; color: #94A3B8; margin-top: 3px; }
  .section-heading {
    font-size: 14px;
    font-weight: 800;
    color: #0F172A;
    margin-bottom: 10px;
    margin-top: 22px;
    padding-bottom: 6px;
    border-bottom: 1px solid #E2E8F0;
    letter-spacing: -0.2px;
  }
  table { width: 100%; border-collapse: collapse; }
  th {
    background: #F1F5F9;
    color: #475569;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 9px 10px;
    text-align: left;
    border-bottom: 1px solid #CBD5E1;
  }
  td { padding: 9px 10px; border-bottom: 1px solid #F1F5F9; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #F8FAFC; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 20px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .badge-paid { background: #DCFCE7; color: #16A34A; }
  .badge-pending { background: #FEF9C3; color: #CA8A04; }
  .badge-partial { background: #DBEAFE; color: #2563EB; }
  .badge-overdue { background: #FEE2E2; color: #DC2626; }
  .badge-approved { background: #DCFCE7; color: #16A34A; }
  .badge-submitted { background: #DBEAFE; color: #2563EB; }
  .badge-rejected { background: #FEE2E2; color: #DC2626; }
  .badge-cancelled { background: #F1F5F9; color: #64748B; }
  .sig-footer {
    margin-top: 48px;
    border-top: 1px dashed #CBD5E1;
    padding-top: 18px;
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #64748B;
  }
  .sig-line { margin-top: 32px; border-top: 1px solid #CBD5E1; width: 220px; }
  .watermark { color: #94A3B8; font-size: 10px; text-align: center; margin-top: 24px; }
`;

async function printAndShare(html: string, filename: string, title: string) {
  try {
    const { uri } = await Print.printToFileAsync({ html });
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: title,
        UTI: "com.adobe.pdf",
      });
    } else {
      Alert.alert("Report Ready", `PDF saved at: ${uri}`);
    }
  } catch (err) {
    Alert.alert(
      "PDF Generation Failed",
      err instanceof Error ? err.message : "Could not create PDF report."
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. FINANCIAL P&L STATEMENT (existing, upgraded)
// ─────────────────────────────────────────────────────────────────────────────

interface GeneratePdfParams {
  hostelName: string;
  month?: string;
  summary: FinancialSummary | null;
  expenses: Expense[];
}

export async function generateAndShareFinancialPdf({
  hostelName,
  month,
  summary,
  expenses,
}: GeneratePdfParams): Promise<void> {
  const periodLabel = month
    ? `Monthly Financial Statement — ${month}`
    : "Cumulative Financial Statement (All Time)";

  const totalCollected = summary?.collection?.totalPaid ?? 0;
  const pendingDues = summary?.dues?.totalPending ?? 0;
  const totalExpenses = expenses.reduce(
    (s, e) => s + Number(e.amount || 0),
    0
  );
  const netCashFlow = totalCollected - totalExpenses;
  const isSurplus = netCashFlow >= 0;

  const categoryTotals: Record<string, number> = {};
  expenses.forEach((e) => {
    const cat = e.category || "OTHER";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(e.amount || 0);
  });

  const categoryRowsHtml = Object.entries(categoryTotals)
    .map(
      ([cat, amt]) => `
      <tr>
        <td style="font-weight:600;">${categoryLabels[cat] || cat}</td>
        <td style="text-align:right;font-weight:700;color:#DC2626;">${money(amt)}</td>
      </tr>`
    )
    .join("");

  const expenseRowsHtml =
    expenses.length === 0
      ? `<tr><td colspan="4" style="text-align:center;padding:20px;color:#64748B;">No expenses recorded for this period.</td></tr>`
      : expenses
          .map(
            (e, idx) => `
      <tr style="background:${idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC"}">
        <td>${e.date}</td>
        <td><strong>${categoryLabels[e.category] || e.category}</strong></td>
        <td>${e.title}${e.notes ? `<div style="font-size:10px;color:#64748B;">${e.notes}</div>` : ""}</td>
        <td style="text-align:right;font-weight:700;color:#DC2626;">-${money(e.amount)}</td>
      </tr>`
          )
          .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>Hostella Financial Statement</title>
    <style>${CSS_BASE}</style></head><body>

    <div class="page-header">
      <div>
        <div class="brand">Hostella</div>
        <div class="hostel-name">${hostelName}</div>
        <div class="brand-sub">${periodLabel}</div>
      </div>
      <div class="report-meta">
        <div><strong>Generated:</strong> ${generatedOn()}</div>
        <div style="margin-top:4px;">Accountant / Audit Copy</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card green">
        <div class="kpi-label">Total Inflow</div>
        <div class="kpi-value" style="color:#16A34A;">${money(totalCollected)}</div>
        <div class="kpi-sub">Rent &amp; fees collected</div>
      </div>
      <div class="kpi-card red">
        <div class="kpi-label">Total Outflow</div>
        <div class="kpi-value" style="color:#DC2626;">${money(totalExpenses)}</div>
        <div class="kpi-sub">${expenses.length} expense entries</div>
      </div>
      <div class="kpi-card amber">
        <div class="kpi-label">Pending Dues</div>
        <div class="kpi-value" style="color:#D97706;">${money(pendingDues)}</div>
        <div class="kpi-sub">Uncollected rent</div>
      </div>
      <div class="kpi-card ${isSurplus ? "green" : "red"}">
        <div class="kpi-label">Net Cash Flow</div>
        <div class="kpi-value" style="color:${isSurplus ? "#16A34A" : "#DC2626"};">${money(netCashFlow)}</div>
        <div class="kpi-sub" style="font-weight:700;color:${isSurplus ? "#16A34A" : "#DC2626"};">${isSurplus ? "Net Surplus" : "Net Deficit"}</div>
      </div>
    </div>

    <div class="section-heading">Expenses by Category</div>
    <table>
      <thead><tr><th>Expense Category</th><th style="text-align:right;">Total Amount</th></tr></thead>
      <tbody>${categoryRowsHtml || `<tr><td colspan="2" style="text-align:center;padding:14px;color:#64748B;">No expenses recorded</td></tr>`}</tbody>
    </table>

    <div class="section-heading">Itemized Expense Transactions</div>
    <table>
      <thead>
        <tr><th>Date</th><th>Category</th><th>Description / Vendor</th><th style="text-align:right;">Amount</th></tr>
      </thead>
      <tbody>${expenseRowsHtml}</tbody>
    </table>

    <div class="sig-footer">
      <div>
        <div>Verified By (Warden / Admin)</div>
        <div class="sig-line"></div>
      </div>
      <div style="text-align:right;">
        <div>Audited By (Accountant)</div>
        <div class="sig-line" style="margin-left:auto;"></div>
      </div>
    </div>
    <div class="watermark">Hostella Hostel Management Platform • Confidential Financial Report</div>
  </body></html>`;

  await printAndShare(
    html,
    `Hostella_Financial_${month || "AllTime"}.pdf`,
    `Download ${hostelName} Financial Report`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PAYMENT HISTORY REPORT
// ─────────────────────────────────────────────────────────────────────────────

interface PaymentHistoryPdfParams {
  hostelName: string;
  hostel?: Hostel;
  fees: Fee[];
  payments: Payment[];
  renters: Renter[];
  month?: string;
}

export async function generatePaymentHistoryPdf({
  hostelName,
  hostel,
  fees,
  payments,
  renters,
  month,
}: PaymentHistoryPdfParams): Promise<void> {
  const periodLabel = month ? `Payment History — ${month}` : "Complete Payment History (All Time)";

  const renterMap = new Map<string, Renter>();
  renters.forEach((r) => renterMap.set(r.id, r));

  // Filter by month if provided
  const filteredFees = month
    ? fees.filter(
        (f) =>
          f.month === month ||
          String(f.dueDate || "").slice(0, 7) === month
      )
    : fees;

  const filteredPayments = month
    ? payments.filter((p) => {
        const d = String(p.paymentDate || p.submittedAt || p.createdAt || "").slice(0, 7);
        return d === month;
      })
    : payments;

  // Stats
  const totalFeeAmount = filteredFees.reduce((s, f) => s + Number(f.amount || 0), 0);
  const totalPaid = filteredFees.reduce((s, f) => s + Number(f.paidAmount || 0), 0);
  const totalPending = Math.max(0, totalFeeAmount - totalPaid);
  const approvedPayments = filteredPayments.filter(
    (p) => String(p.status || "").toUpperCase() === "APPROVED"
  );
  const pendingProofs = filteredPayments.filter(
    (p) =>
      String(p.status || "").toUpperCase() === "SUBMITTED" ||
      String(p.status || "").toUpperCase() === "PENDING"
  );

  function feeStatusBadge(status?: string): string {
    const s = String(status || "").toUpperCase();
    if (s === "PAID") return `<span class="badge badge-paid">Paid</span>`;
    if (s === "PARTIALLY_PAID") return `<span class="badge badge-partial">Partial</span>`;
    if (s === "OVERDUE") return `<span class="badge badge-overdue">Overdue</span>`;
    if (s === "CANCELLED") return `<span class="badge badge-cancelled">Cancelled</span>`;
    return `<span class="badge badge-pending">Pending</span>`;
  }

  function paymentStatusBadge(status?: string): string {
    const s = String(status || "").toUpperCase();
    if (s === "APPROVED" || s === "COMPLETED") return `<span class="badge badge-approved">Approved</span>`;
    if (s === "SUBMITTED" || s === "PENDING") return `<span class="badge badge-submitted">Submitted</span>`;
    if (s === "REJECTED") return `<span class="badge badge-rejected">Rejected</span>`;
    return `<span class="badge badge-pending">${status || "—"}</span>`;
  }

  const feeRowsHtml =
    filteredFees.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:16px;color:#64748B;">No fee records found for this period.</td></tr>`
      : filteredFees
          .map((fee, idx) => {
            const renter = renterMap.get(fee.renterId);
            const renterName = renter ? getRenterName(renter) : `Renter ${fee.renterId.slice(0, 6)}`;
            const room = renter ? getRenterRoom(renter) : "—";
            const remaining = Math.max(0, Number(fee.amount || 0) - Number(fee.paidAmount || 0));
            return `
          <tr style="background:${idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC"}">
            <td><strong>${renterName}</strong><div style="font-size:10px;color:#64748B;">Room ${room}</div></td>
            <td>${fee.month}</td>
            <td style="font-weight:700;">${money(fee.amount)}</td>
            <td style="color:#16A34A;font-weight:700;">${money(fee.paidAmount || 0)}</td>
            <td style="color:${remaining > 0 ? "#DC2626" : "#16A34A"};font-weight:700;">${remaining > 0 ? money(remaining) : "—"}</td>
            <td>${feeStatusBadge(fee.status)}</td>
          </tr>`;
          })
          .join("");

  const proofRowsHtml =
    filteredPayments.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:16px;color:#64748B;">No payment submissions found for this period.</td></tr>`
      : filteredPayments
          .map((p, idx) => {
            const renter = renterMap.get(p.renterId || "");
            const renterName = renter
              ? getRenterName(renter)
              : `Renter ${(p.renterId || "").slice(0, 6)}`;
            return `
          <tr style="background:${idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC"}">
            <td><strong>${renterName}</strong></td>
            <td>${formatDate(p.paymentDate || p.submittedAt || p.createdAt)}</td>
            <td style="font-weight:700;color:#16A34A;">${money(p.amount)}</td>
            <td>${p.paymentMethod || "—"}</td>
            <td>${p.reference || p.notes || "—"}</td>
            <td>${paymentStatusBadge(p.status)}</td>
          </tr>`;
          })
          .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>Hostella Payment History</title>
    <style>${CSS_BASE}</style></head><body>

    <div class="page-header">
      <div>
        <div class="brand">Hostella</div>
        <div class="hostel-name">${hostelName}</div>
        <div class="brand-sub">${periodLabel}</div>
        ${hostel?.address ? `<div style="font-size:11px;color:#64748B;margin-top:2px;">${hostel.address}${hostel.city ? `, ${hostel.city}` : ""}</div>` : ""}
      </div>
      <div class="report-meta">
        <div><strong>Generated:</strong> ${generatedOn()}</div>
        <div style="margin-top:4px;">Admin / Finance Copy</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card indigo">
        <div class="kpi-label">Total Fees Raised</div>
        <div class="kpi-value" style="color:#4F46E5;">${money(totalFeeAmount)}</div>
        <div class="kpi-sub">${filteredFees.length} fee entries</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Amount Collected</div>
        <div class="kpi-value" style="color:#16A34A;">${money(totalPaid)}</div>
        <div class="kpi-sub">${approvedPayments.length} approved proofs</div>
      </div>
      <div class="kpi-card red">
        <div class="kpi-label">Outstanding Dues</div>
        <div class="kpi-value" style="color:#DC2626;">${money(totalPending)}</div>
        <div class="kpi-sub">${filteredFees.filter(f => String(f.status || "").toUpperCase() !== "PAID").length} unpaid fees</div>
      </div>
      <div class="kpi-card amber">
        <div class="kpi-label">Pending Review</div>
        <div class="kpi-value" style="color:#D97706;">${pendingProofs.length}</div>
        <div class="kpi-sub">Payment proofs to verify</div>
      </div>
    </div>

    <div class="section-heading">Fee Records (${filteredFees.length} entries)</div>
    <table>
      <thead>
        <tr>
          <th>Resident</th>
          <th>Month</th>
          <th>Fee Amount</th>
          <th>Paid</th>
          <th>Balance</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${feeRowsHtml}</tbody>
    </table>

    <div class="section-heading">Payment Submissions &amp; Proofs (${filteredPayments.length} entries)</div>
    <table>
      <thead>
        <tr>
          <th>Resident</th>
          <th>Date</th>
          <th>Amount</th>
          <th>Method</th>
          <th>Reference</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${proofRowsHtml}</tbody>
    </table>

    <div class="sig-footer">
      <div>
        <div>Verified By (Hostel Warden)</div>
        <div class="sig-line"></div>
      </div>
      <div style="text-align:right;">
        <div>Reviewed By (Finance Manager)</div>
        <div class="sig-line" style="margin-left:auto;"></div>
      </div>
    </div>
    <div class="watermark">Hostella Hostel Management Platform • Payment History Report • Confidential</div>
  </body></html>`;

  await printAndShare(
    html,
    `Hostella_Payments_${month || "AllTime"}.pdf`,
    `Download ${hostelName} Payment History`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. INDIVIDUAL RENTER STATEMENT
// ─────────────────────────────────────────────────────────────────────────────

interface RenterStatementPdfParams {
  hostelName: string;
  renter: Renter;
  fees: Fee[];
  payments: Payment[];
}

export async function generateRenterStatementPdf({
  hostelName,
  renter,
  fees,
  payments,
}: RenterStatementPdfParams): Promise<void> {
  const renterName = getRenterName(renter);
  const renterFees = fees.filter((f) => f.renterId === renter.id);
  const renterPayments = payments.filter((p) => p.renterId === renter.id);

  const totalFees = renterFees.reduce((s, f) => s + Number(f.amount || 0), 0);
  const totalPaid = renterFees.reduce((s, f) => s + Number(f.paidAmount || 0), 0);
  const totalBalance = Math.max(0, totalFees - totalPaid);

  function feeStatusBadge(status?: string): string {
    const s = String(status || "").toUpperCase();
    if (s === "PAID") return `<span class="badge badge-paid">Paid</span>`;
    if (s === "PARTIALLY_PAID") return `<span class="badge badge-partial">Partial</span>`;
    if (s === "OVERDUE") return `<span class="badge badge-overdue">Overdue</span>`;
    if (s === "CANCELLED") return `<span class="badge badge-cancelled">Cancelled</span>`;
    return `<span class="badge badge-pending">Pending</span>`;
  }

  function paymentStatusBadge(status?: string): string {
    const s = String(status || "").toUpperCase();
    if (s === "APPROVED" || s === "COMPLETED") return `<span class="badge badge-approved">Approved</span>`;
    if (s === "SUBMITTED" || s === "PENDING") return `<span class="badge badge-submitted">Submitted</span>`;
    if (s === "REJECTED") return `<span class="badge badge-rejected">Rejected</span>`;
    return `<span class="badge badge-pending">${status || "—"}</span>`;
  }

  const feeRowsHtml =
    renterFees.length === 0
      ? `<tr><td colspan="5" style="text-align:center;padding:16px;color:#64748B;">No fees found for this resident.</td></tr>`
      : renterFees
          .map((fee, idx) => {
            const remaining = Math.max(0, Number(fee.amount || 0) - Number(fee.paidAmount || 0));
            return `
          <tr style="background:${idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC"}">
            <td>${fee.month}</td>
            <td style="font-weight:700;">${money(fee.amount)}</td>
            <td style="color:#16A34A;font-weight:700;">${money(fee.paidAmount || 0)}</td>
            <td style="color:${remaining > 0 ? "#DC2626" : "#16A34A"};font-weight:700;">${remaining > 0 ? money(remaining) : "—"}</td>
            <td>${feeStatusBadge(fee.status)}</td>
          </tr>`;
          })
          .join("");

  const payRowsHtml =
    renterPayments.length === 0
      ? `<tr><td colspan="5" style="text-align:center;padding:16px;color:#64748B;">No payment submissions found.</td></tr>`
      : renterPayments
          .map((p, idx) => `
          <tr style="background:${idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC"}">
            <td>${formatDate(p.paymentDate || p.submittedAt || p.createdAt)}</td>
            <td style="font-weight:700;color:#16A34A;">${money(p.amount)}</td>
            <td>${p.paymentMethod || "—"}</td>
            <td>${p.reference || "—"}</td>
            <td>${paymentStatusBadge(p.status)}</td>
          </tr>`
          )
          .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>Hostella Resident Statement</title>
    <style>${CSS_BASE}</style></head><body>

    <div class="page-header">
      <div>
        <div class="brand">Hostella</div>
        <div class="hostel-name">${hostelName}</div>
        <div class="brand-sub">Individual Resident Statement</div>
      </div>
      <div class="report-meta">
        <div><strong>Generated:</strong> ${generatedOn()}</div>
        <div style="margin-top:4px;">Resident Copy</div>
      </div>
    </div>

    <!-- Resident Info Card -->
    <div style="background:#EEF2FF;border:1px solid #C7D2FE;border-radius:10px;padding:16px;margin-bottom:20px;">
      <div style="font-size:18px;font-weight:900;color:#4F46E5;">${renterName}</div>
      <div style="display:flex;gap:32px;margin-top:10px;font-size:12px;color:#475569;">
        <div><strong>Room:</strong> ${getRenterRoom(renter)}</div>
        <div><strong>Email:</strong> ${renter.user?.email || renter.email || "—"}</div>
        <div><strong>Phone:</strong> ${renter.user?.phone || renter.phone || "—"}</div>
        <div><strong>Joined:</strong> ${formatDate(renter.joiningDate)}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card indigo">
        <div class="kpi-label">Monthly Fee</div>
        <div class="kpi-value" style="color:#4F46E5;">${money(renter.monthlyFee || 0)}</div>
        <div class="kpi-sub">Per month</div>
      </div>
      <div class="kpi-card indigo">
        <div class="kpi-label">Total Fees Raised</div>
        <div class="kpi-value" style="color:#4F46E5;">${money(totalFees)}</div>
        <div class="kpi-sub">${renterFees.length} months</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Total Paid</div>
        <div class="kpi-value" style="color:#16A34A;">${money(totalPaid)}</div>
        <div class="kpi-sub">${renterPayments.filter(p => String(p.status||"").toUpperCase() === "APPROVED").length} approvals</div>
      </div>
      <div class="kpi-card ${totalBalance > 0 ? "red" : "green"}">
        <div class="kpi-label">Outstanding Balance</div>
        <div class="kpi-value" style="color:${totalBalance > 0 ? "#DC2626" : "#16A34A"};">${totalBalance > 0 ? money(totalBalance) : "NIL"}</div>
        <div class="kpi-sub">${totalBalance > 0 ? "Please clear dues" : "All clear!"}</div>
      </div>
    </div>

    <div class="section-heading">Fee History (${renterFees.length} months)</div>
    <table>
      <thead>
        <tr><th>Month</th><th>Fee Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
      </thead>
      <tbody>${feeRowsHtml}</tbody>
    </table>

    <div class="section-heading">Payment Submissions (${renterPayments.length} entries)</div>
    <table>
      <thead>
        <tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th></tr>
      </thead>
      <tbody>${payRowsHtml}</tbody>
    </table>

    <div class="sig-footer">
      <div>
        <div>Resident Acknowledgement</div>
        <div class="sig-line"></div>
        <div style="margin-top:4px;">${renterName}</div>
      </div>
      <div style="text-align:right;">
        <div>Hostel Administrator</div>
        <div class="sig-line" style="margin-left:auto;"></div>
      </div>
    </div>
    <div class="watermark">Hostella Hostel Management Platform • Resident Statement • Confidential</div>
  </body></html>`;

  await printAndShare(
    html,
    `Hostella_Statement_${renterName.replace(/\s+/g, "_")}.pdf`,
    `Download Statement — ${renterName}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. MONTHLY MANAGEMENT SUMMARY REPORT
// ─────────────────────────────────────────────────────────────────────────────

interface MonthlySummaryPdfParams {
  hostelName: string;
  hostel?: Hostel;
  month: string;
  dashboard?: Dashboard | null;
  fees: Fee[];
  payments: Payment[];
  renters: Renter[];
  expenses: Expense[];
}

export async function generateMonthlySummaryPdf({
  hostelName,
  hostel,
  month,
  dashboard,
  fees,
  payments,
  renters,
  expenses,
}: MonthlySummaryPdfParams): Promise<void> {
  const monthFees = fees.filter(
    (f) => f.month === month || String(f.dueDate || "").slice(0, 7) === month
  );
  const monthPayments = payments.filter((p) => {
    const d = String(p.paymentDate || p.submittedAt || p.createdAt || "").slice(0, 7);
    return d === month;
  });
  const monthExpenses = expenses.filter(
    (e) => e.month === month || String(e.date || "").slice(0, 7) === month
  );

  const totalFeeRaised = monthFees.reduce((s, f) => s + Number(f.amount || 0), 0);
  const totalCollected = monthFees.reduce((s, f) => s + Number(f.paidAmount || 0), 0);
  const totalPending = Math.max(0, totalFeeRaised - totalCollected);
  const totalExpenses = monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const netFlow = totalCollected - totalExpenses;
  const isSurplus = netFlow >= 0;

  const paidCount = monthFees.filter(
    (f) => String(f.status || "").toUpperCase() === "PAID"
  ).length;
  const unpaidCount = monthFees.filter(
    (f) => String(f.status || "").toUpperCase() !== "PAID"
  ).length;
  const activeRenters = renters.filter(
    (r) => String(r.status || "").toUpperCase() === "ACTIVE"
  ).length;

  // Category breakdown for expenses
  const catTotals: Record<string, number> = {};
  monthExpenses.forEach((e) => {
    const cat = e.category || "OTHER";
    catTotals[cat] = (catTotals[cat] || 0) + Number(e.amount || 0);
  });

  const expCatRows = Object.entries(catTotals)
    .map(([cat, amt]) => `<tr><td>${categoryLabels[cat] || cat}</td><td style="text-align:right;color:#DC2626;font-weight:700;">${money(amt)}</td></tr>`)
    .join("");

  // Fee status breakdown table
  const feeStatusRows = monthFees
    .slice(0, 50) // cap at 50 to avoid huge PDFs
    .map((fee, idx) => {
      const renter = renters.find((r) => r.id === fee.renterId);
      const name = renter ? getRenterName(renter) : `ID:${fee.renterId.slice(0, 6)}`;
      const room = renter ? getRenterRoom(renter) : "—";
      const status = String(fee.status || "").toUpperCase();
      const badgeClass =
        status === "PAID"
          ? "badge-paid"
          : status === "PARTIALLY_PAID"
          ? "badge-partial"
          : status === "OVERDUE"
          ? "badge-overdue"
          : "badge-pending";
      const badgeLabel =
        status === "PAID"
          ? "Paid"
          : status === "PARTIALLY_PAID"
          ? "Partial"
          : status === "OVERDUE"
          ? "Overdue"
          : "Pending";
      return `
        <tr style="background:${idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC"}">
          <td><strong>${name}</strong><div style="font-size:10px;color:#64748B;">Rm ${room}</div></td>
          <td style="font-weight:700;">${money(fee.amount)}</td>
          <td style="color:#16A34A;font-weight:700;">${money(fee.paidAmount || 0)}</td>
          <td style="color:${Number(fee.amount || 0) - Number(fee.paidAmount || 0) > 0 ? "#DC2626" : "#16A34A"};font-weight:700;">
            ${Number(fee.amount) - Number(fee.paidAmount || 0) > 0 ? money(Number(fee.amount) - Number(fee.paidAmount || 0)) : "—"}
          </td>
          <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
        </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>Hostella Monthly Summary</title>
    <style>${CSS_BASE}</style></head><body>

    <div class="page-header">
      <div>
        <div class="brand">Hostella</div>
        <div class="hostel-name">${hostelName}</div>
        <div class="brand-sub">Monthly Management Summary Report — ${month}</div>
        ${hostel?.address ? `<div style="font-size:11px;color:#64748B;margin-top:2px;">${hostel.address}${hostel.city ? `, ${hostel.city}` : ""}${hostel.state ? ` — ${hostel.state}` : ""}</div>` : ""}
      </div>
      <div class="report-meta">
        <div><strong>Generated:</strong> ${generatedOn()}</div>
        <div style="margin-top:4px;">Management / Board Copy</div>
      </div>
    </div>

    <!-- Operational KPIs -->
    <div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Operational Overview</div>
    <div class="kpi-grid">
      <div class="kpi-card indigo">
        <div class="kpi-label">Active Residents</div>
        <div class="kpi-value" style="color:#4F46E5;">${activeRenters}</div>
        <div class="kpi-sub">of ${renters.length} total</div>
      </div>
      <div class="kpi-card indigo">
        <div class="kpi-label">Total Rooms</div>
        <div class="kpi-value" style="color:#4F46E5;">${dashboard?.totalRooms ?? hostel?.totalRooms ?? "—"}</div>
        <div class="kpi-sub">${dashboard?.occupiedRooms ?? "—"} occupied</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Paid Fees</div>
        <div class="kpi-value" style="color:#16A34A;">${paidCount}</div>
        <div class="kpi-sub">of ${monthFees.length} entries</div>
      </div>
      <div class="kpi-card red">
        <div class="kpi-label">Unpaid Fees</div>
        <div class="kpi-value" style="color:#DC2626;">${unpaidCount}</div>
        <div class="kpi-sub">Needs follow-up</div>
      </div>
    </div>

    <!-- Financial KPIs -->
    <div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-top:20px;margin-bottom:10px;">Financial Summary</div>
    <div class="kpi-grid">
      <div class="kpi-card indigo">
        <div class="kpi-label">Fees Raised</div>
        <div class="kpi-value" style="color:#4F46E5;">${money(totalFeeRaised)}</div>
        <div class="kpi-sub">Gross billing</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Collected</div>
        <div class="kpi-value" style="color:#16A34A;">${money(totalCollected)}</div>
        <div class="kpi-sub">Total inflow</div>
      </div>
      <div class="kpi-card red">
        <div class="kpi-label">Pending Dues</div>
        <div class="kpi-value" style="color:#DC2626;">${money(totalPending)}</div>
        <div class="kpi-sub">Uncollected</div>
      </div>
      <div class="kpi-card amber">
        <div class="kpi-label">Total Expenses</div>
        <div class="kpi-value" style="color:#D97706;">${money(totalExpenses)}</div>
        <div class="kpi-sub">${monthExpenses.length} entries</div>
      </div>
    </div>

    <!-- Net Cash Flow highlight -->
    <div style="background:${isSurplus ? "#F0FDF4" : "#FEF2F2"};border:1px solid ${isSurplus ? "#BBF7D0" : "#FECACA"};border-radius:10px;padding:16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Net Operating Cash Flow</div>
        <div style="font-size:28px;font-weight:900;color:${isSurplus ? "#16A34A" : "#DC2626"};margin-top:4px;">${money(netFlow)}</div>
      </div>
      <div style="font-size:16px;font-weight:800;color:${isSurplus ? "#16A34A" : "#DC2626"};background:${isSurplus ? "#DCFCE7" : "#FEE2E2"};padding:10px 18px;border-radius:8px;">
        ${isSurplus ? "✓ Surplus" : "⚠ Deficit"}
      </div>
    </div>

    ${monthExpenses.length > 0 ? `
    <div class="section-heading">Expense Breakdown</div>
    <table>
      <thead><tr><th>Category</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>${expCatRows}</tbody>
    </table>` : ""}

    <div class="section-heading">Resident Fee Status (${month})</div>
    <table>
      <thead>
        <tr><th>Resident</th><th>Fee Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
      </thead>
      <tbody>${feeStatusRows || `<tr><td colspan="5" style="text-align:center;padding:16px;color:#64748B;">No fee data for ${month}.</td></tr>`}</tbody>
    </table>
    ${monthFees.length > 50 ? `<div style="text-align:center;color:#64748B;font-size:11px;margin-top:8px;">Showing first 50 of ${monthFees.length} records. Use filters for specific renters.</div>` : ""}

    <div class="sig-footer">
      <div>
        <div>Hostel Warden / Administrator</div>
        <div class="sig-line"></div>
      </div>
      <div style="text-align:right;">
        <div>Management / Board</div>
        <div class="sig-line" style="margin-left:auto;"></div>
      </div>
    </div>
    <div class="watermark">Hostella Hostel Management Platform • Monthly Management Report • ${month} • Confidential</div>
  </body></html>`;

  await printAndShare(
    html,
    `Hostella_Monthly_${month}.pdf`,
    `Download ${hostelName} — ${month} Report`
  );
}
