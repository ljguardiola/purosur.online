import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqlitePinReplacementStore } from "./sqlite-pin-replacement-store";

let database: LocalDatabase;
let store: SqlitePinReplacementStore;

function addUser(id: string, verifier: string | null): void {
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version, removed) VALUES (?, 'Ada', 'cashier', ?, 1, 1, 0)",
    )
    .run(id, `salt-of-${id}`);
  if (verifier !== null) {
    database
      .prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES (?, ?)")
      .run(id, verifier);
  }
}

function addFailures(userId: string, consecutiveFailures: number): void {
  database
    .prepare(
      "INSERT INTO pin_sign_in_failures (user_id, consecutive_failures, last_failed_at) VALUES (?, ?, '2026-05-01T10:00:00.000Z')",
    )
    .run(userId, consecutiveFailures);
}

function failuresOf(userId: string): number | undefined {
  return database
    .prepare<[string], { consecutive_failures: number }>(
      "SELECT consecutive_failures FROM pin_sign_in_failures WHERE user_id = ?",
    )
    .get(userId)?.consecutive_failures;
}

function storedVerifier(userId: string): string | undefined {
  return database
    .prepare<[string], { verifier: string }>("SELECT verifier FROM pin_verifiers WHERE user_id = ?")
    .get(userId)?.verifier;
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  store = new SqlitePinReplacementStore(database);
  database
    .prepare(
      "INSERT INTO roles (id, name, is_administrator, version, removed) VALUES ('cashier', 'cashier', 0, 1, 0)",
    )
    .run();
});

afterEach(() => {
  database.close();
});

describe("saving a person's PIN verifier", () => {
  it("reports a verifier that stays the same as unchanged", () => {
    addUser("u1", "the-verifier");

    expect(store.savePinCredential("u1", "the-verifier")).toBe(false);
    expect(storedVerifier("u1")).toBe("the-verifier");
  });

  it("reports a different verifier as changed, keeping the new one", () => {
    addUser("u1", "the-verifier");

    expect(store.savePinCredential("u1", "another-verifier")).toBe(true);
    expect(storedVerifier("u1")).toBe("another-verifier");
  });

  it("reports a verifier saved for a person who had none as changed", () => {
    addUser("u1", null);

    expect(store.savePinCredential("u1", "the-verifier")).toBe(true);
    expect(storedVerifier("u1")).toBe("the-verifier");
  });

  it("removes the verifier of a person whose PIN is removed", () => {
    addUser("u1", "the-verifier");

    expect(store.savePinCredential("u1", undefined)).toBe(true);
    expect(storedVerifier("u1")).toBeUndefined();
  });

  it("leaves the failures of the person alone", () => {
    addUser("u1", "the-verifier");
    addFailures("u1", 1);

    store.savePinCredential("u1", "another-verifier");

    expect(failuresOf("u1")).toBe(1);
  });
});

describe("clearing a person's PIN sign-in failures", () => {
  it("clears them for one person without touching another's", () => {
    addUser("u1", "the-verifier");
    addUser("u2", "the-verifier");
    addFailures("u1", 3);
    addFailures("u2", 1);

    store.clearPinSignInFailures("u1");

    expect(failuresOf("u1")).toBeUndefined();
    expect(failuresOf("u2")).toBe(1);
  });
});
