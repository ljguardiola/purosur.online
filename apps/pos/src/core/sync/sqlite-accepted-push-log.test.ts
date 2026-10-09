import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteAcceptedPushLog } from "./sqlite-accepted-push-log";

const ACCEPTED_AT = new Date("2026-10-05T15:00:00.000Z");
const folders: string[] = [];

function openRegister(path = ":memory:"): LocalDatabase {
  return openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

describe("the instant a push was last accepted", () => {
  it("is unknown for a register no push was accepted from", () => {
    const database = openRegister();

    expect(new SqliteAcceptedPushLog(database).lastAcceptedPushAt()).toBeNull();
    database.close();
  });

  it("is the instant recorded", async () => {
    const database = openRegister();
    const log = new SqliteAcceptedPushLog(database);

    await log.recordAcceptedPush(ACCEPTED_AT);

    expect(log.lastAcceptedPushAt()).toEqual(ACCEPTED_AT);
    database.close();
  });

  it("is the latest instant recorded", async () => {
    const database = openRegister();
    const log = new SqliteAcceptedPushLog(database);
    const later = new Date(ACCEPTED_AT.getTime() + 60_000);

    await log.recordAcceptedPush(ACCEPTED_AT);
    await log.recordAcceptedPush(later);

    expect(log.lastAcceptedPushAt()).toEqual(later);
    database.close();
  });

  it("is still known after the register restarts", async () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-accepted-push-"));
    folders.push(folder);
    const path = join(folder, "register.sqlite");
    const before = openRegister(path);
    await new SqliteAcceptedPushLog(before).recordAcceptedPush(ACCEPTED_AT);
    before.close();

    const after = openRegister(path);

    expect(new SqliteAcceptedPushLog(after).lastAcceptedPushAt()).toEqual(ACCEPTED_AT);
    after.close();
  });
});
