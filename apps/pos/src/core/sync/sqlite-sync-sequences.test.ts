import { beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { sqliteSyncSequences } from "./sqlite-sync-sequences";

let database: LocalDatabase;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
});

describe("sqliteSyncSequences", () => {
  it("reads zero for a register that has synced nothing", async () => {
    expect(await sqliteSyncSequences(database).current()).toEqual({
      lastDeviceSeq: 0,
      pullCursor: 0,
    });
  });

  it("reads the last local sequence and the last applied cloud sequence", async () => {
    database.prepare("UPDATE sync_state SET last_device_seq = 41, pull_cursor = 977").run();

    expect(await sqliteSyncSequences(database).current()).toEqual({
      lastDeviceSeq: 41,
      pullCursor: 977,
    });
  });
});
