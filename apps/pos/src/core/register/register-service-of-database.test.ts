import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import type { StartedLocalDatabase } from "./local-database-startup";
import { registerServiceOf } from "./register-service-of-database";

const databases: LocalDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

function readyDatabase(events: string[]): StartedLocalDatabase {
  const database = new Database(":memory:");
  databases.push(database);
  return {
    kind: "ready",
    database,
    health: {
      damageRecorded: async () => false,
      integrityHolds: async () => true,
      recordDamage: async () => {
        events.push("damage recorded");
      },
    },
  };
}

function scheduleRecording(events: string[]) {
  return {
    start: () => {
      events.push("sync started");
    },
  };
}

const DAMAGE = new Database.SqliteError("database disk image is malformed", "SQLITE_CORRUPT");

describe("registerServiceOf", () => {
  it("is in service with the database a ready start hands over", () => {
    const started = readyDatabase([]);

    const register = registerServiceOf(started, () => {});

    expect(register.service).toEqual({ kind: "in_service" });
    expect(register.database).toBe(started.kind === "ready" ? started.database : undefined);
  });

  it("is out of service with no database when the start found the database damaged", () => {
    const register = registerServiceOf({ kind: "out_of_service" }, () => {});

    expect(register.service).toEqual({ kind: "out_of_service" });
    expect(register.database).toBeUndefined();
  });

  it("is in service with no database when the database could not be started", () => {
    const register = registerServiceOf(undefined, () => {});

    expect(register.service).toEqual({ kind: "in_service" });
    expect(register.database).toBeUndefined();
  });

  it("records the damage and then exits when a failure it watches is database damage", async () => {
    const events: string[] = [];
    const register = registerServiceOf(readyDatabase(events), () => events.push("exit"));

    await register.watchFailure(DAMAGE);

    expect(events).toEqual(["damage recorded", "exit"]);
  });

  it("does nothing about a watched failure that is not database damage", async () => {
    const events: string[] = [];
    const register = registerServiceOf(readyDatabase(events), () => events.push("exit"));

    await register.watchFailure(new Error("the cloud could not be reached"));

    expect(events).toEqual([]);
  });

  it("does nothing about a watched failure when it has no database", async () => {
    const events: string[] = [];
    const register = registerServiceOf(undefined, () => events.push("exit"));

    await register.watchFailure(DAMAGE);

    expect(events).toEqual([]);
  });

  it("starts the sync of a register in service", () => {
    const events: string[] = [];

    registerServiceOf(readyDatabase([]), () => {}).startSync(scheduleRecording(events));

    expect(events).toEqual(["sync started"]);
  });

  it("starts no sync of a register out of service, so it pushes nothing to the cloud", () => {
    const events: string[] = [];

    registerServiceOf({ kind: "out_of_service" }, () => {}).startSync(scheduleRecording(events));

    expect(events).toEqual([]);
  });
});
