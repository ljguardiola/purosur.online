import { expect, test } from "vitest";
import { isSameUserId } from "./same-user-id";

test("takes two ids that differ only in letter case for the same user", () => {
  expect(isSameUserId("user-2", "USER-2")).toBe(true);
  expect(isSameUserId("user-2", "user-2")).toBe(true);
});

test("tells apart two different users' ids", () => {
  expect(isSameUserId("user-2", "user-20")).toBe(false);
  expect(isSameUserId("user-2", "user-3")).toBe(false);
});
