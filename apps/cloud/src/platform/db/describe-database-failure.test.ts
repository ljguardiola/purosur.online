import { describe, expect, it } from "vitest";
import { describeDatabaseFailure } from "./describe-database-failure.js";

describe("describeDatabaseFailure", () => {
  it("prints the error's code and message", () => {
    const error = Object.assign(new Error("password authentication failed"), { code: "28P01" });

    expect(describeDatabaseFailure(error)).toBe("28P01: password authentication failed");
  });

  it("includes the database's own error behind a failed query", () => {
    const databaseError = Object.assign(new Error('syntax error at or near "tabel"'), {
      code: "42601",
    });
    const failedQuery = new Error("Failed query: create tabel x", { cause: databaseError });

    expect(describeDatabaseFailure(failedQuery)).toBe(
      'unknown error: Failed query: create tabel x (caused by 42601: syntax error at or near "tabel")',
    );
  });

  it("never prints other fields of the error, such as a connection string it carries", () => {
    const invalidUrl = Object.assign(new TypeError("Invalid URL"), {
      code: "ERR_INVALID_URL",
      input: "postgres://user:s3cret-password@[bad/db",
    });

    const description = describeDatabaseFailure(invalidUrl);

    expect(description).toBe("ERR_INVALID_URL: Invalid URL");
    expect(description).not.toContain("s3cret-password");
  });

  it("describes a thrown value that is not an error by its code alone", () => {
    expect(describeDatabaseFailure("boom")).toBe("unknown error");
  });
});
