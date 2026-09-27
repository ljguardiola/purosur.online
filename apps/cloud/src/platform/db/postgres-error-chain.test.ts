import { describe, expect, it } from "vitest";
import { postgresErrorChain } from "./postgres-error-chain.js";

describe("postgresErrorChain", () => {
  it("reads the violated constraint postgres-js reports as constraint_name", () => {
    const error = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint_name: "alerts_open_dedup_key",
    });

    expect(postgresErrorChain(error)).toEqual([
      { code: "23505", constraint: "alerts_open_dedup_key" },
    ]);
  });

  it("reads the violated constraint PGlite reports as constraint", () => {
    const error = Object.assign(new Error("foreign key"), {
      code: "23503",
      constraint: "audit_log_actor_id_users_id_fk",
    });

    expect(postgresErrorChain(error)).toEqual([
      { code: "23503", constraint: "audit_log_actor_id_users_id_fk" },
    ]);
  });

  it("follows each error's cause, so the database's error behind a failed query is found", () => {
    const databaseError = Object.assign(new Error("foreign key"), {
      code: "23503",
      constraint_name: "audit_log_actor_id_users_id_fk",
    });
    const failedQuery = new Error("Failed query: delete from users", { cause: databaseError });

    expect(postgresErrorChain(failedQuery)).toEqual([
      { code: undefined, constraint: undefined },
      { code: "23503", constraint: "audit_log_actor_id_users_id_fk" },
    ]);
  });

  it("is empty for something that is not an error", () => {
    expect(postgresErrorChain("boom")).toEqual([]);
  });
});
