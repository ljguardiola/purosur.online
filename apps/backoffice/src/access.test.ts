import { expect, test } from "vitest";
import {
  canDeactivateUser,
  canSeeBranchArea,
  canSeeCatalogArea,
  canSeeRegistersArea,
  canSeeRolesArea,
  canSeeUsersArea,
} from "./access";

test("canSeeUsersArea is true for an Administrator", () => {
  expect(canSeeUsersArea({ isAdministrator: true, permissions: [] })).toBe(true);
});

test("canSeeUsersArea is true for a non-Administrator holding deactivate_users", () => {
  expect(canSeeUsersArea({ isAdministrator: false, permissions: ["deactivate_users"] })).toBe(true);
});

test("canSeeUsersArea is false for a non-Administrator without deactivate_users", () => {
  expect(
    canSeeUsersArea({ isAdministrator: false, permissions: ["view_reports", "void_sale"] }),
  ).toBe(false);
});

test("canDeactivateUser is true for an Administrator, against a non-Administrator target", () => {
  expect(
    canDeactivateUser({ isAdministrator: true, permissions: [] }, { isAdministrator: false }),
  ).toBe(true);
});

test("canDeactivateUser is true for a non-Administrator holding deactivate_users, against a non-Administrator target", () => {
  expect(
    canDeactivateUser(
      { isAdministrator: false, permissions: ["deactivate_users"] },
      { isAdministrator: false },
    ),
  ).toBe(true);
});

test("canDeactivateUser is false for a non-Administrator without deactivate_users", () => {
  expect(
    canDeactivateUser({ isAdministrator: false, permissions: [] }, { isAdministrator: false }),
  ).toBe(false);
});

test("canDeactivateUser is false against an Administrator target, even for an Administrator viewer", () => {
  expect(
    canDeactivateUser({ isAdministrator: true, permissions: [] }, { isAdministrator: true }),
  ).toBe(false);
});

test("canSeeRolesArea is true for an Administrator", () => {
  expect(canSeeRolesArea({ isAdministrator: true, permissions: [] })).toBe(true);
});

test("canSeeRolesArea is false for a non-Administrator, however many permissions their role holds", () => {
  expect(canSeeRolesArea({ isAdministrator: false, permissions: ["view_reports"] })).toBe(false);
});

test("canSeeBranchArea is true for an Administrator", () => {
  expect(canSeeBranchArea({ isAdministrator: true, permissions: [] })).toBe(true);
});

test("canSeeBranchArea is true for a non-Administrator holding configure_branch", () => {
  expect(canSeeBranchArea({ isAdministrator: false, permissions: ["configure_branch"] })).toBe(
    true,
  );
});

test("canSeeBranchArea is false for a non-Administrator without configure_branch", () => {
  expect(canSeeBranchArea({ isAdministrator: false, permissions: ["view_reports"] })).toBe(false);
});

test("canSeeCatalogArea is true for an Administrator", () => {
  expect(canSeeCatalogArea({ isAdministrator: true, permissions: [] })).toBe(true);
});

test("canSeeCatalogArea is true for a non-Administrator holding manage_products_and_categories", () => {
  expect(
    canSeeCatalogArea({
      isAdministrator: false,
      permissions: ["manage_products_and_categories"],
    }),
  ).toBe(true);
});

test("canSeeCatalogArea is false for a non-Administrator without manage_products_and_categories", () => {
  expect(canSeeCatalogArea({ isAdministrator: false, permissions: ["view_reports"] })).toBe(false);
});

test("canSeeRegistersArea is true for an Administrator", () => {
  expect(canSeeRegistersArea({ isAdministrator: true, permissions: [] })).toBe(true);
});

test("canSeeRegistersArea is true for a non-Administrator holding enroll_register_devices", () => {
  expect(
    canSeeRegistersArea({ isAdministrator: false, permissions: ["enroll_register_devices"] }),
  ).toBe(true);
});

test("canSeeRegistersArea is false for a non-Administrator without enroll_register_devices", () => {
  expect(canSeeRegistersArea({ isAdministrator: false, permissions: ["view_reports"] })).toBe(
    false,
  );
});
