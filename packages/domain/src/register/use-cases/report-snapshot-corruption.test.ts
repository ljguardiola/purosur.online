import { describe, expect, it } from "vitest";
import { reportSnapshotCorruption } from "./report-snapshot-corruption.js";
import { FixedClock } from "./test-support/fake-register-store.js";
import { FakeSnapshotStore } from "./test-support/fake-snapshot-store.js";

const NOW = new Date("2026-10-14T15:00:00.000Z");
const EARLIER = new Date("2026-10-13T09:00:00.000Z");

function report(store: FakeSnapshotStore, stage: "copy" | "integrity_check" | "foreign_key_check") {
  return reportSnapshotCorruption(
    { store, clock: new FixedClock(NOW) },
    { registerId: "register-1", stage },
  );
}

describe("reportSnapshotCorruption", () => {
  it.each(["copy", "integrity_check", "foreign_key_check"] as const)(
    "freezes the register's retention, recording the %s stage and the time",
    async (stage) => {
      const store = new FakeSnapshotStore();

      expect(await report(store, stage)).toEqual({ kind: "frozen" });

      expect(store.snapshot().freezes).toEqual([
        { registerId: "register-1", stage, frozenAt: NOW },
      ]);
    },
  );

  it("keeps the first report when the register reports again", async () => {
    const store = new FakeSnapshotStore();
    store.seedFreeze({ registerId: "register-1", stage: "copy", frozenAt: EARLIER });

    expect(await report(store, "integrity_check")).toEqual({ kind: "frozen" });

    expect(store.snapshot().freezes).toEqual([
      { registerId: "register-1", stage: "copy", frozenAt: EARLIER },
    ]);
  });

  it("locks the register's snapshots before freezing", async () => {
    const store = new FakeSnapshotStore();

    await report(store, "copy");

    expect(store.operationOrder).toEqual(["lockRegisterSnapshots:register-1", "freezeRetention"]);
  });
});
