import {
  argentinaInstant,
  type DetectedSerialDevice,
  type RegisteredSerialDevices,
  type SerialDeviceRole,
  type SerialDeviceStanding,
} from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import type { CloudReachability } from "../sync/cloud-reachability";
import { SqliteAcceptedPushLog } from "../sync/sqlite-accepted-push-log";
import { stopOpeningNewSales } from "../sync/sqlite-local-installation";
import { registerStatusFor } from "./register-status-requests";
import { createSerialDeviceWatch, type SerialDeviceWatch } from "./serial-device-watch";

const NOW = new Date(argentinaInstant("2026-10-05", "12:00"));
const MINUTE_MS = 60 * 1000;
const SCALE = { vendorId: "1a86", productId: "7523" };

let database: LocalDatabase;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
});

afterEach(() => {
  database.close();
});

function mondayHours(opensAt: string, closesAt: string) {
  const none: { opens_at: string; closes_at: string }[] = [];
  return JSON.stringify({
    monday_hours: [{ opens_at: opensAt, closes_at: closesAt }],
    tuesday_hours: none,
    wednesday_hours: none,
    thursday_hours: none,
    friday_hours: none,
    saturday_hours: none,
    sunday_hours: none,
  });
}

function holdBranchHours(weeklyHours: string): void {
  database
    .prepare(
      `INSERT INTO branch_settings (
         location_id, address, whatsapp_number, instagram_handle, weekly_hours,
         expiring_lot_alert_days, unreviewed_price_alert_days, good_condition_return_days, version
       ) VALUES ('location', 'Av. Belgrano 1450', '', '', ?, 30, 30, 15, 1)`,
    )
    .run(weeklyHours);
}

async function acceptedMinutesAgo(minutes: number): Promise<void> {
  await new SqliteAcceptedPushLog(database).recordAcceptedPush(
    new Date(NOW.getTime() - minutes * MINUTE_MS),
  );
}

const NO_DEVICES: Record<SerialDeviceRole, SerialDeviceStanding> = {
  scale: { kind: "not_registered" },
  reader: { kind: "not_registered" },
};

function status(
  cloud: CloudReachability = "unknown",
  serialDevices: Record<SerialDeviceRole, SerialDeviceStanding> = NO_DEVICES,
) {
  return registerStatusFor({
    database,
    cloud: () => cloud,
    now: () => NOW,
    serialDevices: () => ({ kind: "listed", standings: serialDevices }),
  });
}

function watchListingWith(
  detectedSerialDevices: () => Promise<DetectedSerialDevice[]>,
  registeredSerialDevices: () => RegisteredSerialDevices = () => ({ scale: SCALE }),
) {
  return createSerialDeviceWatch({
    registrations: { registeredSerialDevices },
    enumeration: { detectedSerialDevices },
    intervalMs: 3000,
    scheduleNext: () => () => undefined,
    onChange: () => undefined,
    onFailure: () => undefined,
  });
}

function statusWatchedBy(watch: SerialDeviceWatch) {
  return registerStatusFor({
    database,
    cloud: () => "unknown",
    now: () => NOW,
    serialDevices: watch.reading,
  });
}

describe("the register's status", () => {
  it("holds no condition for a register that sells and has never had a push accepted", async () => {
    expect(await status()).toEqual({
      conditions: [],
      cloud: "unknown",
      serial_devices: { scale: "not_registered", reader: "not_registered" },
    });
  });

  it("holds sales_denied once the register stopped opening new sales because its event history broke", async () => {
    stopOpeningNewSales(database, "event_history_broken", NOW);

    expect((await status()).conditions).toEqual(["sales_denied"]);
  });

  it("holds only installation_revoked once the cloud revoked the installation, with the cloud unreachable", async () => {
    holdBranchHours(mondayHours("09:00", "18:00"));
    await acceptedMinutesAgo(30);
    stopOpeningNewSales(database, "installation_revoked", NOW);

    expect(await status("unreachable")).toEqual({
      conditions: ["installation_revoked"],
      cloud: "unreachable",
      serial_devices: { scale: "not_registered", reader: "not_registered" },
    });
  });

  it("holds register_silent when no push was accepted for 15 minutes of business hours", async () => {
    holdBranchHours(mondayHours("09:00", "18:00"));
    await acceptedMinutesAgo(30);

    expect((await status()).conditions).toEqual(["register_silent"]);
  });

  it("holds no register_silent while the last accepted push is recent", async () => {
    holdBranchHours(mondayHours("09:00", "18:00"));
    await acceptedMinutesAgo(5);

    expect((await status()).conditions).toEqual([]);
  });

  it("holds no register_silent outside the branch's hours", async () => {
    holdBranchHours(mondayHours("13:00", "18:00"));
    await acceptedMinutesAgo(300);

    expect((await status()).conditions).toEqual([]);
  });

  it("holds no register_silent without the branch's hours", async () => {
    await acceptedMinutesAgo(300);

    expect((await status()).conditions).toEqual([]);
  });

  it("holds both conditions, sales_denied first", async () => {
    holdBranchHours(mondayHours("09:00", "18:00"));
    await acceptedMinutesAgo(30);
    stopOpeningNewSales(database, "event_history_broken", NOW);

    expect((await status()).conditions).toEqual(["sales_denied", "register_silent"]);
  });

  it("drops register_silent as soon as a push is accepted again", async () => {
    holdBranchHours(mondayHours("09:00", "18:00"));
    await acceptedMinutesAgo(30);
    await acceptedMinutesAgo(0);

    expect((await status()).conditions).toEqual([]);
  });

  it.each<CloudReachability>(["unknown", "reachable", "unreachable"])(
    "reports the cloud as %s as the holder says at the moment it is asked",
    async (cloud) => {
      expect((await status(cloud)).cloud).toBe(cloud);
    },
  );

  it("reports the kind of each serial device's standing, without the path it was found on", async () => {
    expect(
      (
        await status("unknown", {
          scale: { kind: "matching", path: "COM3" },
          reader: { kind: "not_detected" },
        })
      ).serial_devices,
    ).toEqual({ scale: "matching", reader: "not_detected" });
  });

  it("holds serial_device_missing while a registered device is not detected", async () => {
    expect(
      (
        await status("unknown", {
          scale: { kind: "matching", path: "COM3" },
          reader: { kind: "mismatched" },
        })
      ).conditions,
    ).toEqual(["serial_device_missing"]);
  });

  it("holds no serial_device_missing while every registered device is found", async () => {
    expect(
      (
        await status("unknown", {
          scale: { kind: "matching", path: "COM3" },
          reader: { kind: "not_registered" },
        })
      ).conditions,
    ).toEqual([]);
  });

  it("answers with its other conditions and the registered devices unknown while the serial ports are still being listed", async () => {
    stopOpeningNewSales(database, "event_history_broken", NOW);
    const watch = watchListingWith(() => new Promise(() => undefined));
    void watch.start();

    expect(await statusWatchedBy(watch)).toEqual({
      conditions: ["sales_denied"],
      cloud: "unknown",
      serial_devices: { scale: "unknown", reader: "not_registered" },
    });
  });

  it("answers with its other conditions and the registered devices unknown once listing the serial ports failed", async () => {
    stopOpeningNewSales(database, "event_history_broken", NOW);
    const watch = watchListingWith(async () => {
      throw new Error("the ports could not be listed");
    });
    await watch.start();

    expect(await statusWatchedBy(watch)).toEqual({
      conditions: ["sales_denied"],
      cloud: "unknown",
      serial_devices: { scale: "unknown", reader: "not_registered" },
    });
  });

  it("answers with its other conditions and every device unknown while the registered devices cannot be read", async () => {
    stopOpeningNewSales(database, "event_history_broken", NOW);
    const watch = watchListingWith(
      async () => {
        throw new Error("the ports could not be listed");
      },
      () => {
        throw new Error("the registrations could not be read");
      },
    );
    await watch.start();

    expect(await statusWatchedBy(watch)).toEqual({
      conditions: ["sales_denied"],
      cloud: "unknown",
      serial_devices: { scale: "unknown", reader: "unknown" },
    });
  });
});
