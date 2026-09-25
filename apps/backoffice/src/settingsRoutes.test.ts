import { expect, test } from "vitest";
import {
  isLegacyRolePath,
  MY_ACCOUNT_PATH,
  matchUserDetailPath,
  ROLES_LIST_PATH,
  USERS_LIST_PATH,
  userDetailPath,
} from "./settingsRoutes";

test("userDetailPath builds the list path with the id appended", () => {
  expect(userDetailPath("user-1")).toBe("/settings/users/user-1");
});

test("matchUserDetailPath extracts the id from a detail path", () => {
  expect(matchUserDetailPath("/settings/users/user-1")).toBe("user-1");
});

test("matchUserDetailPath returns undefined for the list path itself", () => {
  expect(matchUserDetailPath(USERS_LIST_PATH)).toBeUndefined();
});

test('matchUserDetailPath returns undefined for MY_ACCOUNT_PATH, not the literal id "me"', () => {
  expect(matchUserDetailPath(MY_ACCOUNT_PATH)).toBeUndefined();
});

test("matchUserDetailPath returns undefined for an unrelated path", () => {
  expect(matchUserDetailPath("/help")).toBeUndefined();
});

test("matchUserDetailPath returns undefined for a path nested past the id", () => {
  expect(matchUserDetailPath("/settings/users/user-1/extra")).toBeUndefined();
});

test("isLegacyRolePath is false for the Roles list itself", () => {
  expect(isLegacyRolePath(ROLES_LIST_PATH)).toBe(false);
});

test("isLegacyRolePath is true for the old new-role page", () => {
  expect(isLegacyRolePath("/settings/roles/new")).toBe(true);
});

test("isLegacyRolePath is true for the old edit-role page", () => {
  expect(isLegacyRolePath("/settings/roles/role-1/edit")).toBe(true);
});

test("isLegacyRolePath is true for the old duplicate-role page", () => {
  expect(isLegacyRolePath("/settings/roles/role-1/duplicate")).toBe(true);
});

test("isLegacyRolePath is false for an unrelated path", () => {
  expect(isLegacyRolePath("/help")).toBe(false);
});
