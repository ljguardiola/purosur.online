import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteAwaitedOrphanSweep } from "./sqlite-awaited-orphan-sweep";

let database: LocalDatabase;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
});

afterEach(() => {
  database.close();
});

describe("the sweep a restored register awaits", () => {
  it("stops awaiting the sweep once it is cleared", async () => {
    database.exec("INSERT INTO awaiting_orphan_sweep (register_id) VALUES ('r1')");

    await new SqliteAwaitedOrphanSweep(database).clear();

    expect(database.prepare("SELECT register_id FROM awaiting_orphan_sweep").all()).toEqual([]);
  });

  it("clears nothing when the register awaits no sweep", async () => {
    await new SqliteAwaitedOrphanSweep(database).clear();

    expect(database.prepare("SELECT register_id FROM awaiting_orphan_sweep").all()).toEqual([]);
  });
});
