import type { DeviceCredentials } from "@purosur/contracts";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { afterEnrollment, storingEnrollmentCredentials } from "./restore-on-enrollment";
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
  setsAside: boolean;
  events: string[] = [];

  constructor(device?: string, setsAside = false) {
    this.device = device;
    this.pendingNow = device !== undefined;
    this.setsAside = setsAside;
  }

  isPending = () => this.pendingNow;
  deviceId = () => this.device;
  setsAsideLiveDatabase = () => this.setsAside;
  begin = (deviceId: string, options?: { setAsideLiveDatabase?: boolean }) => {
    this.events.push(
      options?.setAsideLiveDatabase ? `begin ${deviceId} setting aside` : `begin ${deviceId}`,
    );
    this.pendingNow = true;
    this.device = deviceId;
    this.setsAside = options?.setAsideLiveDatabase === true;
  };
  settleSetAside = () => {
    this.events.push("settle");
    this.setsAside = false;
  };
  clear = () => {
    this.events.push("clear");
    this.pendingNow = false;
    this.device = undefined;
    this.setsAside = false;
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

function staleDatabaseHoldingAnInstallation(): LocalDatabase {
  const database = databaseHoldingAnInstallation();
  database.exec("UPDATE sync_state SET stale_sequence_detected_at = '2026-10-18T09:00:00.000Z'");
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

  it("begins a restore that sets the live database aside, before the credentials are stored, on a database the cloud refused as stale", async () => {
    const pending = new FakePending();

    const result = await storing(pending, staleDatabaseHoldingAnInstallation())(CREDENTIALS);

    expect(result).toBe(true);
    expect(pending.events).toEqual(["begin device-new setting aside", "store"]);
    expect(pending.setsAsideLiveDatabase()).toBe(true);
  });

  it("returns to the restore an earlier enrollment began, instruction included, when the credentials of a stale register could not be stored", async () => {
    const pending = new FakePending("device-earlier", true);

    await storing(pending, staleDatabaseHoldingAnInstallation(), false)(CREDENTIALS);

    expect(pending.deviceId()).toBe("device-earlier");
    expect(pending.setsAsideLiveDatabase()).toBe(true);
  });

  it("is no longer pending when the credentials of a stale register could not be stored", async () => {
    const pending = new FakePending();

    await storing(pending, staleDatabaseHoldingAnInstallation(), false)(CREDENTIALS);

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

describe("what follows an enrollment", () => {
  function following(pending: FakePending) {
    const calls: string[] = [];
    afterEnrollment({
      pending,
      restartCore: () => calls.push("restart the core"),
      attemptRestore: () => calls.push("attempt the restore"),
      syncNow: () => calls.push("sync now"),
    });
    return calls;
  }

  it("restarts the core so the live database is closed when the restore sets it aside", () => {
    expect(following(new FakePending("device-new", true))).toEqual(["restart the core"]);
  });

  it("attempts the restore and syncs when the live database stays", () => {
    expect(following(new FakePending("device-new"))).toEqual(["attempt the restore", "sync now"]);
  });

  it("attempts the restore and syncs when no restore began", () => {
    expect(following(new FakePending())).toEqual(["attempt the restore", "sync now"]);
  });
});
