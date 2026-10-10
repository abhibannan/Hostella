import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Renter, Fee } from "../types";

export interface FinancialSummary {
  totalBilled: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRate: number;
}

/** Generate and share a branded PDF Renter Directory */
export async function exportRenterListPDF(renters: Renter[], hostelName = "Hostella Property"): Promise<void> {
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const tableRows = renters
    .map(
      (r, idx) => `
      <tr style="background-color: ${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${r.room?.roomNumber || "Unassigned"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; font-size: 13px;">${r.name || r.fullName || "Unnamed"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${r.phone || "-"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${r.joiningDate ? new Date(r.joiningDate).toLocaleDateString() : "-"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #10B981;">₹${(r.monthlyFee || 0).toLocaleString()}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px;">
          <span style="padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; background-color: ${
            r.status === "ACTIVE" ? "#DCFCE7" : "#FEE2E2"
          }; color: ${r.status === "ACTIVE" ? "#15803D" : "#B91C1C"};">
            ${r.status || "ACTIVE"}
          </span>
        </td>
      </tr>
    `
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 30px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #4f46e5; padding-bottom: 15px; margin-bottom: 25px; }
          .title { font-size: 24px; font-weight: 800; color: #1e1b4b; margin: 0; }
          .subtitle { font-size: 14px; color: #64748b; margin-top: 4px; }
          .meta { text-align: right; font-size: 12px; color: #64748b; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background-color: #4f46e5; color: #ffffff; text-align: left; padding: 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">${hostelName}</h1>
            <div class="subtitle">Official Resident & Renter Directory</div>
          </div>
          <div class="meta">
            <div>Generated: ${dateStr}</div>
            <div>Total Residents: ${renters.length}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Room</th>
              <th>Resident Name</th>
              <th>Phone</th>
              <th>Joined</th>
              <th>Monthly Rent</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        <div class="footer">
          Generated automatically by Hostella Property Management Platform • Confidential
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      UTI: ".pdf",
      mimeType: "application/pdf",
      dialogTitle: `Export Renters - ${hostelName}`,
    });
  }
}

/** Generate and share a branded PDF Financial Statement */
export async function exportFinancialStatementPDF(
  fees: Fee[],
  summary: FinancialSummary,
  hostelName = "Hostella Property",
  period = "All Time"
): Promise<void> {
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const tableRows = fees
    .map(
      (f, idx) => `
      <tr style="background-color: ${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${f.dueDate ? new Date(f.dueDate).toLocaleDateString() : "-"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${f.renter?.name || f.renterId || "Resident"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${f.room?.roomNumber || "-"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; font-size: 13px;">₹${(f.amount || 0).toLocaleString()}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #10b981; font-weight: 600;">₹${(f.paidAmount || 0).toLocaleString()}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px;">
          <span style="padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; background-color: ${
            f.status === "PAID" ? "#DCFCE7" : f.status === "PENDING" ? "#FEF3C7" : "#FEE2E2"
          }; color: ${
            f.status === "PAID" ? "#15803D" : f.status === "PENDING" ? "#B45309" : "#B91C1C"
          };">
            ${f.status}
          </span>
        </td>
      </tr>
    `
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 30px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #4f46e5; padding-bottom: 15px; margin-bottom: 25px; }
          .title { font-size: 24px; font-weight: 800; color: #1e1b4b; margin: 0; }
          .subtitle { font-size: 14px; color: #64748b; margin-top: 4px; }
          .summary-cards { display: flex; gap: 15px; margin-bottom: 30px; }
          .card { flex: 1; padding: 15px; border-radius: 10px; border: 1px solid #e2e8f0; background: #f8fafc; }
          .card-label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 5px; }
          .card-value { font-size: 20px; font-weight: 800; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background-color: #4f46e5; color: #ffffff; text-align: left; padding: 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">${hostelName}</h1>
            <div class="subtitle">Financial Collections & Revenue Statement (${period})</div>
          </div>
          <div>
            <div style="font-size: 12px; color: #64748b;">Generated: ${dateStr}</div>
          </div>
        </div>

        <div class="summary-cards">
          <div class="card">
            <div class="card-label">Total Billed</div>
            <div class="card-value" style="color: #0f172a;">₹${summary.totalBilled.toLocaleString()}</div>
          </div>
          <div class="card">
            <div class="card-label">Total Collected</div>
            <div class="card-value" style="color: #16a34a;">₹${summary.totalCollected.toLocaleString()}</div>
          </div>
          <div class="card">
            <div class="card-label">Outstanding Due</div>
            <div class="card-value" style="color: #dc2626;">₹${summary.totalOutstanding.toLocaleString()}</div>
          </div>
          <div class="card">
            <div class="card-label">Collection Rate</div>
            <div class="card-value" style="color: #4f46e5;">${summary.collectionRate}%</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Due Date</th>
              <th>Resident</th>
              <th>Room</th>
              <th>Amount</th>
              <th>Paid</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Hostella Automated Accounting • Certified Property Statement
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      UTI: ".pdf",
      mimeType: "application/pdf",
      dialogTitle: `Export Financials - ${hostelName}`,
    });
  }
}

/** Export any data array to CSV and share */
export async function exportToCSV(
  headers: string[],
  rows: (string | number)[][],
  filename: string
): Promise<void> {
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  const fileUri = `${FileSystem.cacheDirectory}${filename}.csv`;
  await FileSystem.writeAsStringAsync(fileUri, csvContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "text/csv",
      dialogTitle: `Export ${filename}`,
    });
  }
}
