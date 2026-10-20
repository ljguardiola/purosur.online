import type { DeviceCredentials } from "@purosur/contracts";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { storingEnrollmentCredentials } from "./restore-on-enrollment";
import type { RestorePending } from "./restore-pending";

const CREDENTIALS: DeviceCredentials = {
  device_id: "device-new",
  device_token: "prefix.secret",
  pepper: "cGVwcGVy",
  token_received_at: "2026-10-19T12:00:00.000Z",
};

class FakePending implements RestorePending {
  device: string | undefined;
  pendingNow: boolean;
  events: string[] = [];

  constructor(device?: string) {
    this.device = device;
    this.pendingNow = device !== undefined;
  }

  isPending = () => this.pendingNow;
  deviceId = () => this.device;
  begin = (deviceId: string) => {
    this.events.push(`begin ${deviceId}`);
    this.pendingNow = true;
    this.device = deviceId;
  };
  clear = () => {
    this.events.push("clear");
    this.pendingNow = false;
    this.device = undefined;
  };
}

const opened: LocalDatabase[] = [];

afterEach(() => {
  for (const database of opened.splice(0)) {
    database.close();
  }
});

function freshDatabase(): LocalDatabase {
  const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  opened.push(database);
  return database;
}

function databaseHoldingAnInstallation(): LocalDatabase {
  const database = freshDatabase();
  database.exec("UPDATE sync_state SET device_id = 'device-earlier'");
  return database;
}

function storing(pending: FakePending, database: LocalDatabase | undefined, stored = true) {
  return storingEnrollmentCredentials({
    store: async () => {
      pending.events.push("store");
      return stored;
    },
    pending,
    database,
  });
}

describe("storing the credentials of an enrollment", () => {
  it("begins a restore for the new installation before the credentials are stored, on a fresh database", async () => {
    const pending = new FakePending();

    const result = await storing(pending, freshDatabase())(CREDENTIALS);

    expect(result).toBe(true);
    expect(pending.events).toEqual(["begin device-new", "store"]);
    expect(pending.deviceId()).toBe("device-new");
  });

  it.each([
    ["a database that already held an installation", databaseHoldingAnInstallation],
    ["no local database", () => undefined],
  ])("begins no restore with %s", async (_name, database) => {
    const pending = new FakePending();

    const result = await storing(pending, database())(CREDENTIALS);

    expect(result).toBe(true);
    expect(pending.events).toEqual(["store"]);
    expect(pending.isPending()).toBe(false);
  });

  it("is no longer pending when the credentials could not be stored", async () => {
    const pending = new FakePending();

    const result = await storing(pending, freshDatabase(), false)(CREDENTIALS);

    expect(result).toBe(false);
    expect(pending.isPending()).toBe(false);
  });

  it("keeps the restore an earlier enrollment began when the new credentials could not be stored", async () => {
    const pending = new FakePending("device-earlier");

    await storing(pending, freshDatabase(), false)(CREDENTIALS);

    expect(pending.deviceId()).toBe("device-earlier");
  });
});
