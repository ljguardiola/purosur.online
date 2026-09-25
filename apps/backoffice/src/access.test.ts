import { expect, test } from "vitest";
import {
  canCloseAlertsManually,
  canDeactivateUser,
  canSeeAlertsArea,
  canSeeBranchArea,
  canSeeCatalogArea,
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

test("canSeeAlertsArea is true for an Administrator", () => {
  expect(canSeeAlertsArea({ isAdministrator: true, permissions: [] })).toBe(true);
});

test("canSeeAlertsArea is true for a non-Administrator holding view_branch_alerts", () => {
  expect(canSeeAlertsArea({ isAdministrator: false, permissions: ["view_branch_alerts"] })).toBe(
    true,
  );
});

test("canSeeAlertsArea is true for a non-Administrator holding view_all_alerts", () => {
  expect(canSeeAlertsArea({ isAdministrator: false, permissions: ["view_all_alerts"] })).toBe(true);
});

test("canSeeAlertsArea is false for a non-Administrator holding neither alert-view permission", () => {
  expect(
    canSeeAlertsArea({ isAdministrator: false, permissions: ["dismiss_alerts_manually"] }),
  ).toBe(false);
});

test("canCloseAlertsManually is true for an Administrator", () => {
  expect(canCloseAlertsManually({ isAdministrator: true, permissions: [] })).toBe(true);
});

test("canCloseAlertsManually is true for a non-Administrator holding dismiss_alerts_manually", () => {
  expect(
    canCloseAlertsManually({ isAdministrator: false, permissions: ["dismiss_alerts_manually"] }),
  ).toBe(true);
});

test("canCloseAlertsManually is false for a non-Administrator without dismiss_alerts_manually", () => {
  expect(canCloseAlertsManually({ isAdministrator: false, permissions: ["view_all_alerts"] })).toBe(
    false,
  );
});
