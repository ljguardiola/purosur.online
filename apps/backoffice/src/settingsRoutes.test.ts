import { expect, test } from "vitest";
import {
  MY_ACCOUNT_PATH,
  matchRoleDuplicatePath,
  matchRoleEditPath,
  matchUserDetailPath,
  NEW_ROLE_PATH,
  ROLES_LIST_PATH,
  roleDuplicatePath,
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

test("matchRoleEditPath returns undefined for the role's own duplicate path", () => {
  expect(matchRoleEditPath(roleDuplicatePath("role-1"))).toBeUndefined();
});

test("roleDuplicatePath builds the list path with the id and /duplicate appended", () => {
  expect(roleDuplicatePath("role-1")).toBe("/settings/roles/role-1/duplicate");
});

test("matchRoleDuplicatePath extracts the id from a duplicate path", () => {
  expect(matchRoleDuplicatePath("/settings/roles/role-1/duplicate")).toBe("role-1");
});

test("matchRoleDuplicatePath returns undefined for the list path itself", () => {
  expect(matchRoleDuplicatePath(ROLES_LIST_PATH)).toBeUndefined();
});

test("matchRoleDuplicatePath returns undefined for the new-role path", () => {
  expect(matchRoleDuplicatePath(NEW_ROLE_PATH)).toBeUndefined();
});

test("matchRoleDuplicatePath returns undefined for the role's own edit path", () => {
  expect(matchRoleDuplicatePath(roleEditPath("role-1"))).toBeUndefined();
});

test("matchRoleDuplicatePath returns undefined for the role's own path with no /duplicate suffix", () => {
  expect(matchRoleDuplicatePath("/settings/roles/role-1")).toBeUndefined();
});

test("matchRoleDuplicatePath returns undefined for an unrelated path", () => {
  expect(matchRoleDuplicatePath("/help")).toBeUndefined();
});

test("matchRoleDuplicatePath returns undefined for a path nested past /duplicate", () => {
  expect(matchRoleDuplicatePath("/settings/roles/role-1/duplicate/extra")).toBeUndefined();
});
