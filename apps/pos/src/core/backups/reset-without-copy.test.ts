import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { resetWithoutCopy } from "./reset-without-copy";

const CREDENTIALS = { device_id: "new-device", device_token: "prefix.secret", pepper: "cGVwcGVy" };
const FIRST_INSTALLATION = { register_id: "register-1", installation_id: "first-device" };

let database: LocalDatabase;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
});

afterEach(() => {
  database.close();
});

const heldDeviceId = () =>
  database.prepare<[], { device_id: string | null }>("SELECT device_id FROM sync_state").get()
    ?.device_id;

const predecessors = () =>
  database.prepare("SELECT device_id, last_acknowledged_seq FROM register_predecessor").all();

describe("resetting a register the cloud holds no copy of", () => {
  it("adopts the enrolled installation and records the register's first installation as its predecessor", async () => {
    await resetWithoutCopy(
      { database, readCredentials: async () => CREDENTIALS },
      FIRST_INSTALLATION,
    );

    expect(heldDeviceId()).toBe("new-device");
    expect(predecessors()).toEqual([{ device_id: "first-device", last_acknowledged_seq: 0 }]);
    expect(database.prepare("SELECT register_id FROM awaiting_restored_numbering").all()).toEqual([
      { register_id: "register-1" },
    ]);
  });

  it("refuses while the register holds no enrollment, leaving its database untouched", async () => {
    await expect(
      resetWithoutCopy({ database, readCredentials: async () => undefined }, FIRST_INSTALLATION),
    ).rejects.toThrow("the register cannot record its first installation yet");

    expect(heldDeviceId()).toBeNull();
    expect(predecessors()).toEqual([]);
  });

  it("refuses while the register has no local database", async () => {
    await expect(
      resetWithoutCopy(
        { database: undefined, readCredentials: async () => CREDENTIALS },
        FIRST_INSTALLATION,
      ),
    ).rejects.toThrow("the register cannot record its first installation yet");
  });
});
