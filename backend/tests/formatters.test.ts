import test from "node:test";
import assert from "node:assert/strict";

// Mirror formatters for headless verification
function listFrom<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (!data || typeof data !== "object") return [];
  const object = data as Record<string, unknown>;
  if (Array.isArray(object[key])) return object[key] as T[];
  if (Array.isArray(object.data)) return object.data as T[];
  if (Array.isArray(object.items)) return object.items as T[];
  return [];
}

function dashboardFrom(data: unknown) {
  const outer = data as Record<string, unknown> | null;
  const raw = (outer?.dashboard ?? data) as Record<string, unknown> | null;
  const value = raw || {};
  const number = (key: string) => Number(value[key] ?? 0);

  return {
    totalRooms: number("totalRooms"),
    activeRooms: number("activeRooms"),
    occupiedRooms: number("occupiedRooms"),
    availableRooms: number("availableRooms"),
    activeRenters: number("activeRenters"),
    totalFees: number("totalFees"),
    paidFees: number("paidFees"),
    pendingFees: number("pendingFees"),
    partiallyPaidFees: number("partiallyPaidFees"),
    overdueFees: number("overdueFees"),
    outstandingFees: number("outstandingFees"),
    totalPayments: number("totalPayments"),
    paidPayments: number("paidPayments"),
    pendingPayments: number("pendingPayments"),
    totalRepairRequests: number("totalRepairRequests"),
    submittedRepairs: number("submittedRepairs"),
    inProgressRepairs: number("inProgressRepairs"),
    resolvedRepairs: number("resolvedRepairs"),
    cancelledRepairs: number("cancelledRepairs"),
  };
}

function money(value: number | undefined): string {
  return `₹${Number(value ?? 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function statusLabel(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

test("listFrom - Extracts array when data is directly an array", () => {
  const input = [{ id: "1" }, { id: "2" }];
  assert.deepStrictEqual(listFrom(input, "rooms"), input);
});

test("listFrom - Extracts array from nested key, data, or items", () => {
  assert.deepStrictEqual(listFrom({ rooms: [{ id: "r1" }] }, "rooms"), [{ id: "r1" }]);
  assert.deepStrictEqual(listFrom({ data: [{ id: "d1" }] }, "rooms"), [{ id: "d1" }]);
  assert.deepStrictEqual(listFrom({ items: [{ id: "i1" }] }, "rooms"), [{ id: "i1" }]);
});

test("listFrom - Gracefully returns [] for null, undefined, or empty payload", () => {
  assert.deepStrictEqual(listFrom(null, "rooms"), []);
  assert.deepStrictEqual(listFrom(undefined, "rooms"), []);
  assert.deepStrictEqual(listFrom("error string", "rooms"), []);
  assert.deepStrictEqual(listFrom({}, "rooms"), []);
});

test("dashboardFrom - Safely handles nested or direct dashboard objects", () => {
  const direct = { totalRooms: 10, activeRooms: 8 };
  assert.strictEqual(dashboardFrom(direct).totalRooms, 10);
  assert.strictEqual(dashboardFrom(direct).activeRooms, 8);
  assert.strictEqual(dashboardFrom(direct).occupiedRooms, 0);

  const nested = { dashboard: { totalRooms: 25, activeRenters: 20 } };
  assert.strictEqual(dashboardFrom(nested).totalRooms, 25);
  assert.strictEqual(dashboardFrom(nested).activeRenters, 20);
});

test("dashboardFrom - Handles null and empty payloads without throwing", () => {
  const empty = dashboardFrom(null);
  assert.strictEqual(empty.totalRooms, 0);
  assert.strictEqual(empty.totalFees, 0);
  assert.strictEqual(empty.activeRenters, 0);
});

test("money - Correctly formats currency with Indian Rupee symbol", () => {
  assert.strictEqual(money(0), "₹0");
  assert.strictEqual(money(5000), "₹5,000");
  assert.strictEqual(money(undefined), "₹0");
});

test("statusLabel - Formats enum status to Title Case", () => {
  assert.strictEqual(statusLabel("IN_PROGRESS"), "In Progress");
  assert.strictEqual(statusLabel("SUBMITTED"), "Submitted");
  assert.strictEqual(statusLabel("PARTIALLY_PAID"), "Partially Paid");
});
