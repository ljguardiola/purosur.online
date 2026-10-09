import type { SalesStopState } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { registerTelemetryReader } from "./register-telemetry";

const STORAGE = { wal_size_bytes: 8192, disk_free_bytes: 25_000, disk_free_ratio: 0.25 };

function readerStopped(stop: SalesStopState) {
  return registerTelemetryReader(
    async () => STORAGE,
    () => stop,
  );
}

describe("the register's telemetry", () => {
  it("reports its storage and that it can sell while it still opens new sales", async () => {
    expect(await readerStopped({ stopped: false })()).toEqual({ ...STORAGE, sales_denied: false });
  });

  it("reports its storage, that it can't sell and why when its event history broke", async () => {
    expect(await readerStopped({ stopped: true, reason: "event_history_broken" })()).toEqual({
      ...STORAGE,
      sales_denied: true,
      sales_denied_reason: "event_history_broken",
    });
  });

  it("reports only its storage once the cloud revoked its installation", async () => {
    expect(await readerStopped({ stopped: true, reason: "installation_revoked" })()).toEqual(
      STORAGE,
    );
  });

  it("reads what it is stopped for each time it reports", async () => {
    let stop: SalesStopState = { stopped: false };
    const read = registerTelemetryReader(
      async () => STORAGE,
      () => stop,
    );

    const before = await read();
    stop = { stopped: true, reason: "event_history_broken" };
    const after = await read();

    expect(before).toMatchObject({ sales_denied: false });
    expect(after).toMatchObject({ sales_denied: true });
  });
});
