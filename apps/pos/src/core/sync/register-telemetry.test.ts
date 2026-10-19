import type {
  BatteryReport,
  LatestPreEmissionGateOutcome,
  SalesStopState,
  SerialDevicesReport,
  StorageSalesStop,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { damagedRegisterTelemetryReader, registerTelemetryReader } from "./register-telemetry";

const STORAGE = { wal_size_bytes: 8192, disk_free_bytes: 25_000, disk_free_ratio: 0.25 };

const SERIAL_DEVICES: SerialDevicesReport = {
  scale: { standing: "matching", vendor_id: "1a86", product_id: "7523" },
  reader: { standing: "not_detected", vendor_id: "26f1", product_id: "8802" },
};

const BATTERY: BatteryReport = {
  present: true,
  charge_percent: 64,
  health_percent: 88,
  on_battery: true,
  on_battery_minutes: 12,
};

function readerStopped(
  stop: SalesStopState,
  latestGate: LatestPreEmissionGateOutcome | undefined = undefined,
  battery: BatteryReport | undefined = undefined,
  storageStop: StorageSalesStop | undefined = undefined,
  localDatabaseDamaged = false,
  batteryCritical = false,
) {
  return registerTelemetryReader(
    async () => STORAGE,
    () => stop,
    () => SERIAL_DEVICES,
    () => latestGate,
    () => battery,
    () => storageStop,
    () => localDatabaseDamaged,
    () => batteryCritical,
  );
}

describe("the register's telemetry", () => {
  it("reports sales denied for the storage stop the watch reads", async () => {
    expect(
      await readerStopped({ stopped: false }, undefined, undefined, { reason: "disk_full" })(),
    ).toMatchObject({ sales_denied: true, sales_denied_reason: "disk_full" });
  });

  it("reports that it can't sell because its battery is critically low while new sales are refused for it", async () => {
    expect(
      await readerStopped({ stopped: false }, undefined, BATTERY, undefined, false, true)(),
    ).toMatchObject({ sales_denied: true, sales_denied_reason: "battery_critical" });
  });

  it("reports that it can't sell because its local database is damaged while it keeps running", async () => {
    expect(
      await readerStopped({ stopped: false }, undefined, undefined, undefined, true)(),
    ).toMatchObject({ sales_denied: true, sales_denied_reason: "local_database_damaged" });
  });

  it("reports its storage and that it can sell while it still opens new sales", async () => {
    expect(await readerStopped({ stopped: false })()).toEqual({
      ...STORAGE,
      sales_denied: false,
      fiscal_emission_stopped: false,
      serial_devices: SERIAL_DEVICES,
    });
  });

  it("reports its fiscal emission stopped, and why, while its latest sale failed the pre-emission check", async () => {
    expect(
      await readerStopped(
        { stopped: false },
        { kind: "failed", reason: "gross_income_registration_missing" },
      )(),
    ).toEqual({
      ...STORAGE,
      sales_denied: false,
      fiscal_emission_stopped: true,
      fiscal_emission_stopped_reason: "gross_income_registration_missing",
      serial_devices: SERIAL_DEVICES,
    });
  });

  it("reports its fiscal emission available once its latest sale passed the check", async () => {
    expect(await readerStopped({ stopped: false }, { kind: "passed" })()).toMatchObject({
      fiscal_emission_stopped: false,
    });
  });

  it("reports its fiscal emission stopped even when its installation was revoked", async () => {
    expect(
      await readerStopped(
        { stopped: true, reason: "installation_revoked" },
        { kind: "failed", reason: "legal_name_missing" },
      )(),
    ).toMatchObject({ fiscal_emission_stopped: true });
  });

  it("reports its storage, that it can't sell and why when its event history broke", async () => {
    expect(await readerStopped({ stopped: true, reason: "event_history_broken" })()).toEqual({
      ...STORAGE,
      sales_denied: true,
      sales_denied_reason: "event_history_broken",
      fiscal_emission_stopped: false,
      serial_devices: SERIAL_DEVICES,
    });
  });

  it("reports only its storage, fiscal emission and serial devices once the cloud revoked its installation", async () => {
    expect(await readerStopped({ stopped: true, reason: "installation_revoked" })()).toEqual({
      ...STORAGE,
      fiscal_emission_stopped: false,
      serial_devices: SERIAL_DEVICES,
    });
  });

  it("reads the serial devices each time it reports", async () => {
    let devices = SERIAL_DEVICES;
    const read = registerTelemetryReader(
      async () => STORAGE,
      () => ({ stopped: false }),
      () => devices,
      () => undefined,
      () => undefined,
      () => undefined,
    );

    const before = await read();
    devices = {
      ...SERIAL_DEVICES,
      reader: { standing: "matching", vendor_id: "26f1", product_id: "8802" },
    };
    const after = await read();

    expect(before.serial_devices?.reader.standing).toBe("not_detected");
    expect(after.serial_devices?.reader.standing).toBe("matching");
  });

  it("reports its battery when it has one to report", async () => {
    expect(await readerStopped({ stopped: false }, undefined, BATTERY)()).toMatchObject({
      battery: BATTERY,
    });
    expect(await readerStopped({ stopped: false }, undefined, { present: false })()).toMatchObject({
      battery: { present: false },
    });
  });

  it("reports no battery at all, not an absent one, while its battery cannot be read", async () => {
    expect(await readerStopped({ stopped: false })()).not.toHaveProperty("battery");
  });

  it("reads its battery each time it reports", async () => {
    let battery: BatteryReport | undefined;
    const read = registerTelemetryReader(
      async () => STORAGE,
      () => ({ stopped: false }),
      () => SERIAL_DEVICES,
      () => undefined,
      () => battery,
      () => undefined,
    );

    const before = await read();
    battery = BATTERY;
    const after = await read();

    expect(before).not.toHaveProperty("battery");
    expect(after.battery).toEqual(BATTERY);
  });

  it("reads what it is stopped for each time it reports", async () => {
    let stop: SalesStopState = { stopped: false };
    const read = registerTelemetryReader(
      async () => STORAGE,
      () => stop,
      () => SERIAL_DEVICES,
      () => undefined,
      () => undefined,
      () => undefined,
    );

    const before = await read();
    stop = { stopped: true, reason: "event_history_broken" };
    const after = await read();

    expect(before).toMatchObject({ sales_denied: false });
    expect(after).toMatchObject({ sales_denied: true });
  });

  it("reads its latest pre-emission check each time it reports", async () => {
    let latest: LatestPreEmissionGateOutcome | undefined;
    const read = registerTelemetryReader(
      async () => STORAGE,
      () => ({ stopped: false }),
      () => SERIAL_DEVICES,
      () => latest,
      () => undefined,
      () => undefined,
    );

    const before = await read();
    latest = { kind: "failed", reason: "legal_name_missing" };
    const after = await read();

    expect(before).toMatchObject({ fiscal_emission_stopped: false });
    expect(after).toMatchObject({ fiscal_emission_stopped: true });
  });
});

describe("the register's clock drift telemetry", () => {
  function readerOfClockOffset(readClockOffsetMs: () => number | null) {
    return registerTelemetryReader(
      async () => STORAGE,
      () => ({ stopped: false }),
      () => SERIAL_DEVICES,
      () => undefined,
      () => undefined,
      () => undefined,
      () => false,
      () => false,
      readClockOffsetMs,
    );
  }

  it("reads the latest offset each time it reports", async () => {
    let offset: number | null = 0;
    const read = readerOfClockOffset(() => offset);

    const before = await read();
    offset = -120_000;
    const after = await read();

    expect(before).toMatchObject({ clock_drift: false });
    expect(after).toMatchObject({ clock_drift: true });
  });
});

describe("the telemetry of a register whose local database is damaged", () => {
  it("reports its storage, that it can't sell and that its local database is damaged", async () => {
    const read = damagedRegisterTelemetryReader(
      async () => STORAGE,
      () => undefined,
    );

    expect(await read()).toEqual({
      ...STORAGE,
      sales_denied: true,
      sales_denied_reason: "local_database_damaged",
    });
    expect(await read()).not.toHaveProperty("serial_devices");
    expect(await read()).not.toHaveProperty("fiscal_emission_stopped");
    expect(await read()).not.toHaveProperty("clock_drift");
    expect(await read()).not.toHaveProperty("battery");
  });

  it("still reports its battery when it has one to report", async () => {
    const read = damagedRegisterTelemetryReader(
      async () => STORAGE,
      () => BATTERY,
    );

    expect(await read()).toMatchObject({ sales_denied: true, battery: BATTERY });
  });
});
