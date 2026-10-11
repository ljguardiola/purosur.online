import { FICTIONAL_CUIT, FICTIONAL_LEGAL_NAME } from "@purosur/domain/fiscal/test-support";
import { DrizzleQueryError } from "drizzle-orm";
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
      'unknown error: Failed query: create tabel x (caused by 42601: syntax error at or near "[redacted]")',
    );
  });

  it("describes a failed query by its statement, never by the values it was given", () => {
    const databaseError = Object.assign(
      new Error("duplicate key value violates unique constraint"),
      {
        code: "23505",
      },
    );
    const failedQuery = new DrizzleQueryError(
      "insert into users (email) values ($1)",
      ["ada@example.test"],
      databaseError,
    );

    expect(describeDatabaseFailure(failedQuery)).toBe(
      "unknown error: Failed query: insert into users (email) values ($1) (caused by 23505: duplicate key value violates unique constraint)",
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

  it("hides the value the database quotes in the error behind a failed query, keeping its code", () => {
    const databaseError = Object.assign(
      new Error(`invalid input syntax for type uuid: "${FICTIONAL_CUIT}"`),
      { code: "22P02" },
    );
    const failedQuery = new DrizzleQueryError(
      'select "id" from "suppliers" where "suppliers"."id" = $1',
      [FICTIONAL_CUIT],
      databaseError,
    );

    expect(describeDatabaseFailure(failedQuery)).toBe(
      'unknown error: Failed query: select "id" from "suppliers" where "suppliers"."id" = $1 (caused by 22P02: invalid input syntax for type uuid: "[redacted]")',
    );
  });

  it("hides quoted values in every error of the chain below a failed query", () => {
    const driverError = Object.assign(new Error(`value "${FICTIONAL_LEGAL_NAME}" refused`), {
      code: "22000",
    });
    const wrapper = new Error(`could not store "${FICTIONAL_CUIT}"`, { cause: driverError });
    const failedQuery = new DrizzleQueryError(
      "insert into suppliers (cuit) values ($1)",
      [FICTIONAL_CUIT],
      wrapper,
    );

    const description = describeDatabaseFailure(failedQuery);

    expect(description).toBe(
      'unknown error: Failed query: insert into suppliers (cuit) values ($1) (caused by unknown error: could not store "[redacted]" (caused by 22000: value "[redacted]" refused))',
    );
  });

  it("never prints the driver's detail naming the value of a key", () => {
    const databaseError = Object.assign(
      new Error('duplicate key value violates unique constraint "suppliers_cuit_key"'),
      { code: "23505", detail: `Key (cuit)=(${FICTIONAL_CUIT}) already exists.` },
    );
    const failedQuery = new DrizzleQueryError(
      "insert into suppliers (cuit) values ($1)",
      [FICTIONAL_CUIT],
      databaseError,
    );

    expect(describeDatabaseFailure(failedQuery)).not.toContain(FICTIONAL_CUIT);
  });

  it("drops the values listed by a failed query's message, whatever error carries it", () => {
    const failedQuery = new Error(
      `Failed query: insert into suppliers (cuit) values ($1)\nparams: ${FICTIONAL_CUIT}`,
    );

    expect(describeDatabaseFailure(failedQuery)).toBe(
      "unknown error: Failed query: insert into suppliers (cuit) values ($1)",
    );
  });

  it("keeps the quoted text of an error no failed query is behind", () => {
    const error = Object.assign(new Error('password authentication failed for user "cloud_app"'), {
      code: "28P01",
    });

    expect(describeDatabaseFailure(error)).toBe(
      '28P01: password authentication failed for user "cloud_app"',
    );
  });
});
