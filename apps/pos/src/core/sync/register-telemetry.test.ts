import type {
  LatestPreEmissionGateOutcome,
  SalesStopState,
  SerialDevicesReport,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { damagedRegisterTelemetryReader, registerTelemetryReader } from "./register-telemetry";

const STORAGE = { wal_size_bytes: 8192, disk_free_bytes: 25_000, disk_free_ratio: 0.25 };

const SERIAL_DEVICES: SerialDevicesReport = {
  scale: { standing: "matching", vendor_id: "1a86", product_id: "7523" },
  reader: { standing: "not_detected", vendor_id: "26f1", product_id: "8802" },
};

function readerStopped(
  stop: SalesStopState,
  latestGate: LatestPreEmissionGateOutcome | undefined = undefined,
) {
  return registerTelemetryReader(
    async () => STORAGE,
    () => stop,
    () => SERIAL_DEVICES,
    () => latestGate,
  );
}

describe("the register's telemetry", () => {
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

  it("reads what it is stopped for each time it reports", async () => {
    let stop: SalesStopState = { stopped: false };
    const read = registerTelemetryReader(
      async () => STORAGE,
      () => stop,
      () => SERIAL_DEVICES,
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
    );

    const before = await read();
    latest = { kind: "failed", reason: "legal_name_missing" };
    const after = await read();

    expect(before).toMatchObject({ fiscal_emission_stopped: false });
    expect(after).toMatchObject({ fiscal_emission_stopped: true });
  });
});

describe("the telemetry of a register whose local database is damaged", () => {
  it("reports its storage, that it can't sell and that its local database is damaged", async () => {
    expect(await damagedRegisterTelemetryReader(async () => STORAGE)()).toEqual({
      ...STORAGE,
      sales_denied: true,
      sales_denied_reason: "local_database_damaged",
    });
    expect(await damagedRegisterTelemetryReader(async () => STORAGE)()).not.toHaveProperty(
      "serial_devices",
    );
    expect(await damagedRegisterTelemetryReader(async () => STORAGE)()).not.toHaveProperty(
      "fiscal_emission_stopped",
    );
  });
});
