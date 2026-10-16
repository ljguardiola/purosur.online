import { expect, test } from "vitest";
import { snapshotBackupsFilters } from "./routes";

test("opens the backups on the first register", () => {
  expect(snapshotBackupsFilters.parse({})).toEqual({ register: "" });
});

test("keeps the register a URL names", () => {
  expect(snapshotBackupsFilters.parse({ register: "register-2" })).toEqual({
    register: "register-2",
  });
});

test("falls back to the first register for a value that is not text", () => {
  expect(snapshotBackupsFilters.parse({ register: 7 })).toEqual({ register: "" });
});
