import { describe, expect, it } from "vitest";
import { recordSnapshotUploaded } from "./record-snapshot-uploaded.js";
import { FixedClock } from "./test-support/fake-register-store.js";
import { FakeSnapshotStore } from "./test-support/fake-snapshot-store.js";

const NOW = new Date("2026-10-14T15:00:00.000Z");

function report(store: FakeSnapshotStore, registerId = "register-1") {
  return recordSnapshotUploaded(
    { store, clock: new FixedClock(NOW) },
    { registerId, generationId: "generation-1" },
  );
}

describe("recordSnapshotUploaded", () => {
  it("marks a declared generation as uploaded when the register reports it", async () => {
    const store = new FakeSnapshotStore();
    store.seedGeneration({ id: "generation-1" });

    expect(await report(store)).toEqual({ kind: "recorded" });

    expect(store.snapshot().generations[0]).toMatchObject({
      status: "uploaded",
      uploadReportedAt: NOW,
    });
  });

  it("answers the same way when the report arrives again", async () => {
    const store = new FakeSnapshotStore();
    store.seedGeneration({ id: "generation-1" });
    await report(store);

    expect(await report(store)).toEqual({ kind: "recorded" });
  });

  it("leaves a settled generation as it is", async () => {
    const store = new FakeSnapshotStore();
    store.seedGeneration({ id: "generation-1", status: "verified" });
    const before = store.snapshot();

    expect(await report(store)).toEqual({ kind: "recorded" });

    expect(store.snapshot()).toEqual(before);
  });

  it.each(["uploaded", "verified", "failed"] as const)(
    "records no report for a generation already %s",
    async (status) => {
      const store = new FakeSnapshotStore();
      store.seedGeneration({ id: "generation-1", status });

      await report(store);

      expect(store.operationOrder).not.toContain("recordUploadReported");
    },
  );

  it("refuses a generation nobody declared", async () => {
    expect(await report(new FakeSnapshotStore())).toEqual({ kind: "generation_unknown" });
  });

  it("refuses a generation another register declared", async () => {
    const store = new FakeSnapshotStore();
    store.seedGeneration({ id: "generation-1", registerId: "register-other" });
    const before = store.snapshot();

    expect(await report(store)).toEqual({ kind: "generation_unknown" });

    expect(store.snapshot()).toEqual(before);
  });

  it("locks the register's snapshots before looking the generation up among its own", async () => {
    const store = new FakeSnapshotStore();
    store.seedGeneration({ id: "generation-1" });

    await report(store);

    expect(store.operationOrder).toEqual([
      "lockRegisterSnapshots:register-1",
      "findGeneration:register-1",
      "recordUploadReported",
    ]);
  });
});
