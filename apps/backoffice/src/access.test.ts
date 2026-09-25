import { expect, test } from "vitest";
import { canSeeBranchArea, canSeeRolesArea, canSeeUsersArea } from "./access";

test("canSeeUsersArea is true for an Administrator", () => {
  expect(canSeeUsersArea({ isAdministrator: true, permissions: [] })).toBe(true);
});

test("canSeeUsersArea is false for a non-Administrator with no delegable Users permission yet", () => {
  expect(
    canSeeUsersArea({ isAdministrator: false, permissions: ["view_reports", "void_sale"] }),
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
