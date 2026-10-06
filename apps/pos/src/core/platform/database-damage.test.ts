import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { isDatabaseDamage } from "./database-damage";

describe("isDatabaseDamage", () => {
  it.each(["SQLITE_CORRUPT", "SQLITE_CORRUPT_VTAB", "SQLITE_CORRUPT_INDEX", "SQLITE_NOTADB"])(
    "takes the database error %s for damage",
    (code) => {
      expect(isDatabaseDamage(new Database.SqliteError("damaged", code))).toBe(true);
    },
  );

  it.each(["SQLITE_BUSY", "SQLITE_FULL", "SQLITE_CONSTRAINT_UNIQUE", "SQLITE_READONLY"])(
    "does not take the database error %s for damage",
    (code) => {
      expect(isDatabaseDamage(new Database.SqliteError("not damaged", code))).toBe(false);
    },
  );

  it("does not take an error that is not from the database for damage", () => {
    expect(isDatabaseDamage(new Error("SQLITE_CORRUPT"))).toBe(false);
    expect(isDatabaseDamage("SQLITE_CORRUPT")).toBe(false);
    expect(isDatabaseDamage(undefined)).toBe(false);
  });
});
