import {
  argentinaInstant,
  type DetectedSerialDevice,
  type RegisteredSerialDevices,
  type SerialDeviceRole,
  type SerialDeviceStanding,
  type StorageStanding,
} from "@purosur/domain";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertPreEmissionGateOutcome } from "../fiscal/sqlite-pre-emission-gate";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import type { CloudReachability } from "../sync/cloud-reachability";
import { SqliteAcceptedPushLog } from "../sync/sqlite-accepted-push-log";
import { stopOpeningNewSales } from "../sync/sqlite-local-installation";
import { registerStatusFor } from "./register-status-requests";
import { createSerialDeviceWatch, type SerialDeviceWatch } from "./serial-device-watch";

const NOW = new Date(argentinaInstant("2026-10-05", "12:00"));
const MINUTE_MS = 60 * 1000;
const SCALE = { vendorId: "1a86", productId: "7523" };

let database: LocalDatabase;
let signedInPerson: SignedInPerson;

function addPerson(id: string, permissions: string[]): void {
  database
    .prepare("INSERT INTO roles (id, name, is_administrator, version) VALUES (?, ?, 0, 1)")
    .run(`role-`, `role-`);
  for (const key of permissions) {
    database
      .prepare("INSERT INTO role_permissions (role_id, permission_key, active) VALUES (?, ?, 1)")
      .run(`role-`, key);
  }
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, ?, ?, 'salt', 1, 1)",
    )
    .run(id, id, `role-`);
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  signedInPerson = createSignedInPerson();
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

const ROOMY_STORAGE: StorageStanding = {
  startupShortOf: null,
  diskStanding: "enough",
  diskFreeRatio: 0.5,
  walOversized: false,
};

function status(
  cloud: CloudReachability = "unknown",
  serialDevices: Record<SerialDeviceRole, SerialDeviceStanding> = NO_DEVICES,
  storage: StorageStanding = ROOMY_STORAGE,
) {
  return registerStatusFor({
    database,
    cloud: () => cloud,
    now: () => NOW,
    signedInPerson,
    serialDevices: () => ({ kind: "listed", standings: serialDevices, registered: {} }),
    storage: () => storage,
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
    signedInPerson,
    serialDevices: watch.reading,
    storage: () => ROOMY_STORAGE,
  });
}

function recordGateOutcome(saleId: string, minutesAgo: number, passed: boolean): void {
  const occurredAt = new Date(NOW.getTime() - minutesAgo * MINUTE_MS);
  database
    .prepare(
      `INSERT OR IGNORE INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-1', 'register-1', 'device-1', 'cashier', ?, 0, 'OPEN')`,
    )
    .run(new Date(NOW.getTime() - 60 * MINUTE_MS).toISOString());
  database
    .prepare(
      "INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at) VALUES (?, 'register-1', 'device-1', 'session-1', 'cashier', 'COMPLETED', ?)",
    )
    .run(saleId, occurredAt.toISOString());
  insertPreEmissionGateOutcome(database, {
    saleId,
    evaluatedAt: occurredAt,
    outcome: passed
      ? {
          kind: "passed",
          document: {
            invoiceClass: "C",
            total: 5900,
            netAmount: 5900,
            vatAmount: 0,
            issuer: {
              legalName: FICTIONAL_LEGAL_NAME,
              cuit: FICTIONAL_CUIT,
              taxStatus: "Condicion de prueba",
              grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
              activityStartDate: "2020-01-15",
              version: 1,
            },
            buyerTaxStatusCode: 5,
            buyerTaxStatusDescription: "Consumidor Final",
          },
        }
      : { kind: "failed", reason: "legal_name_missing" },
  });
}

describe("the register's status", () => {
  it("holds no condition for a register that sells and has never had a push accepted", async () => {
    expect(await status()).toEqual({
      conditions: [],
      cloud: "unknown",
      serial_devices: { scale: "not_registered", reader: "not_registered" },
      serial_devices_setup_offered: false,
    });
  });

  it("holds sales_denied once the register stopped opening new sales because its event history broke", async () => {
    stopOpeningNewSales(database, "event_history_broken", NOW);

    expect((await status()).conditions).toEqual([
      { kind: "sales_denied", reason: "event_history_broken", level: "critical" },
    ]);
  });

  it("holds fiscal_emission_stopped, with the cloud unreachable, while the latest sale failed the pre-emission check", async () => {
    recordGateOutcome("sale-1", 10, false);

    expect(await status("unreachable")).toMatchObject({
      conditions: [{ kind: "fiscal_emission_stopped", level: "critical" }],
      cloud: "unreachable",
    });
  });

  it("drops fiscal_emission_stopped as soon as a later sale passes the pre-emission check", async () => {
    recordGateOutcome("sale-1", 10, false);
    recordGateOutcome("sale-2", 5, true);

    expect((await status()).conditions).toEqual([]);
  });

  it("holds only installation_revoked once the cloud revoked the installation, with the cloud unreachable", async () => {
    holdBranchHours(mondayHours("09:00", "18:00"));
    await acceptedMinutesAgo(30);
    stopOpeningNewSales(database, "installation_revoked", NOW);

    expect(await status("unreachable")).toEqual({
      conditions: [{ kind: "installation_revoked", level: "critical" }],
      cloud: "unreachable",
      serial_devices: { scale: "not_registered", reader: "not_registered" },
      serial_devices_setup_offered: false,
    });
  });

  it("holds register_silent when no push was accepted for 15 minutes of business hours", async () => {
    holdBranchHours(mondayHours("09:00", "18:00"));
    await acceptedMinutesAgo(30);

    expect((await status()).conditions).toEqual([{ kind: "register_silent", level: "critical" }]);
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

    expect((await status()).conditions).toEqual([
      { kind: "sales_denied", reason: "event_history_broken", level: "critical" },
      { kind: "register_silent", level: "critical" },
    ]);
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
    ).toEqual([{ kind: "serial_device_missing", level: "warning" }]);
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
      conditions: [{ kind: "sales_denied", reason: "event_history_broken", level: "critical" }],
      cloud: "unknown",
      serial_devices: { scale: "unknown", reader: "not_registered" },
      serial_devices_setup_offered: false,
    });
  });

  it("answers with its other conditions and the registered devices unknown once listing the serial ports failed", async () => {
    stopOpeningNewSales(database, "event_history_broken", NOW);
    const watch = watchListingWith(async () => {
      throw new Error("the ports could not be listed");
    });
    await watch.start();

    expect(await statusWatchedBy(watch)).toEqual({
      conditions: [{ kind: "sales_denied", reason: "event_history_broken", level: "critical" }],
      cloud: "unknown",
      serial_devices: { scale: "unknown", reader: "not_registered" },
      serial_devices_setup_offered: false,
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
      conditions: [{ kind: "sales_denied", reason: "event_history_broken", level: "critical" }],
      cloud: "unknown",
      serial_devices: { scale: "unknown", reader: "unknown" },
      serial_devices_setup_offered: false,
    });
  });
});

describe("whether the register offers the serial devices setup", () => {
  it("offers it to a signed-in person who may configure serial devices while neither device is registered", async () => {
    addPerson("u1", ["enroll_register_devices"]);
    signedInPerson.set("u1");

    expect((await status()).serial_devices_setup_offered).toBe(true);
  });

  it("does not offer it to a signed-in person who may not configure serial devices", async () => {
    addPerson("u1", ["sell_and_charge"]);
    signedInPerson.set("u1");

    expect((await status()).serial_devices_setup_offered).toBe(false);
  });

  it("does not offer it while nobody is signed in", async () => {
    addPerson("u1", ["enroll_register_devices"]);

    expect((await status()).serial_devices_setup_offered).toBe(false);
  });

  it("does not offer it when the signed-in person is not an active person of the register", async () => {
    signedInPerson.set("ghost");

    expect((await status()).serial_devices_setup_offered).toBe(false);
  });

  it("does not offer it once a device is registered", async () => {
    addPerson("u1", ["enroll_register_devices"]);
    signedInPerson.set("u1");

    expect(
      (
        await status("unknown", {
          scale: { kind: "matching", path: "COM3" },
          reader: { kind: "not_registered" },
        })
      ).serial_devices_setup_offered,
    ).toBe(false);
  });
});

describe("the register's storage conditions on its status", () => {
  it("holds no storage condition while the disk and the log are fine", async () => {
    expect((await status()).conditions).toEqual([]);
  });

  it("holds a low disk as a warning", async () => {
    const { conditions } = await status("unknown", NO_DEVICES, {
      ...ROOMY_STORAGE,
      diskStanding: "low",
    });

    expect(conditions).toEqual([{ kind: "disk_space_low", level: "warning" }]);
  });

  it("holds an oversized log as a warning", async () => {
    const { conditions } = await status("unknown", NO_DEVICES, {
      ...ROOMY_STORAGE,
      walOversized: true,
    });

    expect(conditions).toEqual([{ kind: "wal_oversized", level: "warning" }]);
  });

  it("holds a full disk as the reason sales are denied, with the free space left", async () => {
    const { conditions } = await status("unknown", NO_DEVICES, {
      ...ROOMY_STORAGE,
      diskStanding: "full",
      diskFreeRatio: 0.03,
    });

    expect(conditions).toEqual([
      { kind: "sales_denied", reason: "disk_full", disk_free_ratio: 0.03, level: "critical" },
    ]);
  });

  it("holds a disk that was short of space at startup as the reason sales are denied, with the space required", async () => {
    const { conditions } = await status("unknown", NO_DEVICES, {
      ...ROOMY_STORAGE,
      startupShortOf: { requiredFreeBytes: 3_000_000_000 },
    });

    expect(conditions).toEqual([
      {
        kind: "sales_denied",
        reason: "disk_space_short_at_startup",
        required_free_bytes: 3_000_000_000,
        level: "critical",
      },
    ]);
  });
});
