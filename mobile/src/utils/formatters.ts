import { Renter, Dashboard } from "../types";

export function getName(renter?: Renter | null): string {
  if (!renter) return "Resident";
  if (typeof renter === "string") return renter;
  if (renter.name && renter.name.trim()) return renter.name.trim();
  if (renter.fullName && renter.fullName.trim()) return renter.fullName.trim();
  if (renter.user?.name && renter.user.name.trim()) return renter.user.name.trim();
  if (renter.user?.fullName && renter.user.fullName.trim()) return renter.user.fullName.trim();
  const first = (renter.user?.firstName || (renter as any).firstName || "").trim();
  const last = (renter.user?.lastName || (renter as any).lastName || "").trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  if ((renter as any).displayName && (renter as any).displayName.trim()) return (renter as any).displayName.trim();
  if ((renter.user as any)?.displayName && (renter.user as any).displayName.trim()) return (renter.user as any).displayName.trim();
  if (renter.email && renter.email.trim()) return renter.email.trim();
  if (renter.user?.email && renter.user.email.trim()) return renter.user.email.trim();
  if (renter.phone && renter.phone.trim()) return renter.phone.trim();
  if (renter.user?.phone && renter.user.phone.trim()) return renter.user.phone.trim();
  if (renter.guardianName && renter.guardianName.trim()) return `Resident (${renter.guardianName.trim()}'s ward)`;
  return "Resident";
}

export function getEmail(renter?: Renter | null): string {
  if (!renter) return "";
  return renter.email || renter.user?.email || "";
}

export function listFrom<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (!data || typeof data !== "object") return [];
  const object = data as Record<string, unknown>;
  if (Array.isArray(object[key])) return object[key] as T[];
  if (Array.isArray(object.data)) return object.data as T[];
  if (Array.isArray(object.items)) return object.items as T[];
  return [];
}

export function dashboardFrom(data: unknown): Dashboard {
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

export function money(value: number | undefined): string {
  return `₹${Number(value ?? 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function statusLabel(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}
