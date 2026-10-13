import test from "node:test";
import assert from "node:assert/strict";

function calculateSafeDueDate(year: number, monthNum: number, desiredDueDay: number): string {
  // monthNum: 1-12
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const safeDay = Math.min(Math.max(1, desiredDueDay), daysInMonth);
  return `${year}-${String(monthNum).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function computeFeeStatus(amount: number, paidAmount: number, dueDate: string, asOfDate: string): string {
  if (paidAmount >= amount && amount > 0) {
    return "PAID";
  }
  if (paidAmount > 0 && paidAmount < amount) {
    return asOfDate > dueDate ? "OVERDUE" : "PARTIALLY_PAID";
  }
  if (asOfDate > dueDate) {
    return "OVERDUE";
  }
  return "PENDING";
}

test("Due Date Calculation - Clamps to 28 days in non-leap February", () => {
  const feb2025 = calculateSafeDueDate(2025, 2, 31);
  assert.strictEqual(feb2025, "2025-02-28");
});

test("Due Date Calculation - Clamps to 29 days in leap year February", () => {
  const feb2024 = calculateSafeDueDate(2024, 2, 31);
  assert.strictEqual(feb2024, "2024-02-29");
});

test("Due Date Calculation - Clamps to 30 days in April, June, September, November", () => {
  assert.strictEqual(calculateSafeDueDate(2025, 4, 31), "2025-04-30");
  assert.strictEqual(calculateSafeDueDate(2025, 6, 31), "2025-06-30");
  assert.strictEqual(calculateSafeDueDate(2025, 9, 31), "2025-09-30");
  assert.strictEqual(calculateSafeDueDate(2025, 11, 31), "2025-11-30");
});

test("Due Date Calculation - Keeps normal days when within month range", () => {
  assert.strictEqual(calculateSafeDueDate(2025, 5, 5), "2025-05-05");
  assert.strictEqual(calculateSafeDueDate(2025, 1, 15), "2025-01-15");
});

test("Fee Status - PAID when paidAmount equals or exceeds total amount", () => {
  assert.strictEqual(computeFeeStatus(5000, 5000, "2025-03-10", "2025-03-15"), "PAID");
  assert.strictEqual(computeFeeStatus(5000, 6000, "2025-03-10", "2025-03-15"), "PAID");
});

test("Fee Status - PENDING before due date with zero payment", () => {
  assert.strictEqual(computeFeeStatus(5000, 0, "2025-03-10", "2025-03-05"), "PENDING");
});

test("Fee Status - PARTIALLY_PAID before due date with partial payment", () => {
  assert.strictEqual(computeFeeStatus(5000, 2500, "2025-03-10", "2025-03-05"), "PARTIALLY_PAID");
});

test("Fee Status - OVERDUE past due date with zero or partial payment", () => {
  assert.strictEqual(computeFeeStatus(5000, 0, "2025-03-10", "2025-03-15"), "OVERDUE");
  assert.strictEqual(computeFeeStatus(5000, 2000, "2025-03-10", "2025-03-15"), "OVERDUE");
});
