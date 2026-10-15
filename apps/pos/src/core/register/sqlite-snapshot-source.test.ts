import { beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { readOwnRegisterId, readSyncSequences } from "./sqlite-snapshot-source";

let database: LocalDatabase;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
});

describe("readSyncSequences", () => {
  it("reads zero for a register that has synced nothing", () => {
    expect(readSyncSequences(database)).toEqual({ lastDeviceSeq: 0, pullCursor: 0 });
  });

  it("reads the last local sequence and the last applied cloud sequence", () => {
    database.prepare("UPDATE sync_state SET last_device_seq = 41, pull_cursor = 977").run();

    expect(readSyncSequences(database)).toEqual({ lastDeviceSeq: 41, pullCursor: 977 });
  });
});

describe("readOwnRegisterId", () => {
  it("reads nothing before the register is enrolled", () => {
    expect(readOwnRegisterId(database)).toBeUndefined();
  });

  it("reads the id of the register this installation is", () => {
    database
      .prepare("INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1)")
      .run();

    expect(readOwnRegisterId(database)).toBe("register-1");
  });

  it("reads nothing once the register was removed", () => {
    database
      .prepare("INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1)")
      .run();
    database.prepare("UPDATE own_register SET removed = 1").run();

    expect(readOwnRegisterId(database)).toBeUndefined();
  });
});
