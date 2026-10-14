import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { isDiskFull } from "./disk-full";

describe("isDiskFull", () => {
  it("takes the database error SQLITE_FULL for a full disk", () => {
    expect(isDiskFull(new Database.SqliteError("database or disk is full", "SQLITE_FULL"))).toBe(
      true,
    );
  });

  it.each(["SQLITE_BUSY", "SQLITE_CORRUPT", "SQLITE_CONSTRAINT_UNIQUE", "SQLITE_READONLY"])(
    "does not take the database error %s for a full disk",
    (code) => {
      expect(isDiskFull(new Database.SqliteError("something else", code))).toBe(false);
    },
  );

  it("does not take an error that is not from the database for a full disk", () => {
    expect(isDiskFull(new Error("SQLITE_FULL"))).toBe(false);
    expect(isDiskFull("SQLITE_FULL")).toBe(false);
    expect(isDiskFull(undefined)).toBe(false);
  });
});
