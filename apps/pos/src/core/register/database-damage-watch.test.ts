import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { watchForDatabaseDamage } from "./database-damage-watch";

function watchedCore() {
  const events: string[] = [];
  const watch = watchForDatabaseDamage({
    health: {
      damageRecorded: async () => false,
      integrityHolds: async () => true,
      recordDamage: async () => {
        events.push("damage recorded");
      },
    },
    exit: () => {
      events.push("exit");
    },
  });
  return { events, watch };
}

describe("watchForDatabaseDamage", () => {
  it("records the damage and then exits the core when a failure is database damage", async () => {
    const { events, watch } = watchedCore();

    await watch(new Database.SqliteError("database disk image is malformed", "SQLITE_CORRUPT"));

    expect(events).toEqual(["damage recorded", "exit"]);
  });

  it("does nothing about a failure that is not database damage", async () => {
    const { events, watch } = watchedCore();

    await watch(new Database.SqliteError("database is locked", "SQLITE_BUSY"));
    await watch(new Error("the cloud could not be reached"));

    expect(events).toEqual([]);
  });
});
