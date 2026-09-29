import { expect, test } from "vitest";
import { createQueryClient } from "./query-client";

test("a read is never repeated by itself: not after a failure, not when the window regains focus, not when the connection comes back, and not skipped while the browser reports it is offline", () => {
  expect(createQueryClient().getDefaultOptions().queries).toEqual({
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    networkMode: "always",
  });
});

test("creates an independent client each time", () => {
  expect(createQueryClient()).not.toBe(createQueryClient());
});
