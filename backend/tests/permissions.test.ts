import test from "node:test";
import assert from "node:assert/strict";
import type { UserRole } from "../src/types/auth.js";

interface PermissionRule {
  allowedRoles: UserRole[];
  canCreateHostel: boolean;
  canDeleteHostel: boolean;
  canManageRooms: boolean;
  canManageRenters: boolean;
  canManageFees: boolean;
  canManagePayments: boolean;
  canManageRepairs: boolean;
  canAddPartners: boolean;
}

function checkPermission(
  role: UserRole,
  action: keyof Omit<PermissionRule, "allowedRoles">,
): boolean {
  switch (action) {
    case "canCreateHostel":
      // Super Admin and Admin only; Partner is strictly forbidden
      return role === "SUPER_ADMIN" || role === "ADMIN";

    case "canDeleteHostel":
      // Super Admin and Admin only; Partner is strictly forbidden
      return role === "SUPER_ADMIN" || role === "ADMIN";

    case "canManageRooms":
    case "canManageRenters":
    case "canManageFees":
    case "canManagePayments":
    case "canManageRepairs":
      // Super Admin, Admin, and Partner can manage operational hostel records
      return role === "SUPER_ADMIN" || role === "ADMIN" || role === "PARTNER";

    case "canAddPartners":
      // Only full Admins can add partners
      return role === "SUPER_ADMIN" || role === "ADMIN";

    default:
      return false;
  }
}

test("Permissions - PARTNER can manage rooms, renters, fees, payments, and repairs", () => {
  const partnerRole: UserRole = "PARTNER";
  assert.strictEqual(checkPermission(partnerRole, "canManageRooms"), true);
  assert.strictEqual(checkPermission(partnerRole, "canManageRenters"), true);
  assert.strictEqual(checkPermission(partnerRole, "canManageFees"), true);
  assert.strictEqual(checkPermission(partnerRole, "canManagePayments"), true);
  assert.strictEqual(checkPermission(partnerRole, "canManageRepairs"), true);
});

test("Permissions - PARTNER CANNOT create or delete hostels", () => {
  const partnerRole: UserRole = "PARTNER";
  assert.strictEqual(checkPermission(partnerRole, "canCreateHostel"), false);
  assert.strictEqual(checkPermission(partnerRole, "canDeleteHostel"), false);
});

test("Permissions - PARTNER CANNOT add or invite other partners", () => {
  const partnerRole: UserRole = "PARTNER";
  assert.strictEqual(checkPermission(partnerRole, "canAddPartners"), false);
});

test("Permissions - ADMIN can perform all hostel actions including adding partners", () => {
  const adminRole: UserRole = "ADMIN";
  assert.strictEqual(checkPermission(adminRole, "canCreateHostel"), true);
  assert.strictEqual(checkPermission(adminRole, "canDeleteHostel"), true);
  assert.strictEqual(checkPermission(adminRole, "canManageRooms"), true);
  assert.strictEqual(checkPermission(adminRole, "canManageRenters"), true);
  assert.strictEqual(checkPermission(adminRole, "canManageFees"), true);
  assert.strictEqual(checkPermission(adminRole, "canAddPartners"), true);
});

test("Permissions - RENTER is denied from all administrative hostel operations", () => {
  const renterRole: UserRole = "RENTER";
  assert.strictEqual(checkPermission(renterRole, "canCreateHostel"), false);
  assert.strictEqual(checkPermission(renterRole, "canDeleteHostel"), false);
  assert.strictEqual(checkPermission(renterRole, "canManageRooms"), false);
  assert.strictEqual(checkPermission(renterRole, "canManageRenters"), false);
  assert.strictEqual(checkPermission(renterRole, "canManageFees"), false);
  assert.strictEqual(checkPermission(renterRole, "canAddPartners"), false);
});
