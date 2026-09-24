import { expect, test } from "vitest";
import {
  MY_ACCOUNT_PATH,
  matchUserDetailPath,
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
