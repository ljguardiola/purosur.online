import { expect, test } from "vitest";
import {
  MY_ACCOUNT_PATH,
  matchRoleEditPath,
  matchUserDetailPath,
  NEW_ROLE_PATH,
  ROLES_LIST_PATH,
  roleEditPath,
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

test("roleEditPath builds the list path with the id and /edit appended", () => {
  expect(roleEditPath("role-1")).toBe("/settings/roles/role-1/edit");
});

test("matchRoleEditPath extracts the id from an edit path", () => {
  expect(matchRoleEditPath("/settings/roles/role-1/edit")).toBe("role-1");
});

test("matchRoleEditPath returns undefined for the list path itself", () => {
  expect(matchRoleEditPath(ROLES_LIST_PATH)).toBeUndefined();
});

test("matchRoleEditPath returns undefined for the new-role path", () => {
  expect(matchRoleEditPath(NEW_ROLE_PATH)).toBeUndefined();
});

test("matchRoleEditPath returns undefined for the role's own path with no /edit suffix", () => {
  expect(matchRoleEditPath("/settings/roles/role-1")).toBeUndefined();
});

test("matchRoleEditPath returns undefined for an unrelated path", () => {
  expect(matchRoleEditPath("/help")).toBeUndefined();
});

test("matchRoleEditPath returns undefined for a path nested past /edit", () => {
  expect(matchRoleEditPath("/settings/roles/role-1/edit/extra")).toBeUndefined();
});
