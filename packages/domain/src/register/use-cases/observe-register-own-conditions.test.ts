import { describe, expect, it } from "vitest";
import { observeRegisterOwnConditions } from "./observe-register-own-conditions.js";
import { FakeRegisterConditionStartStore } from "./test-support/fake-register-condition-start-store.js";
import { FixedClock } from "./test-support/fake-register-store.js";

const EARLIER = new Date("2026-10-14T15:00:00.000Z");
const NOW = new Date("2026-10-14T16:00:00.000Z");

function observe(
  store: FakeRegisterConditionStartStore,
  held: readonly string[],
  at = NOW,
  notYetKnown: readonly string[] = [],
) {
  return observeRegisterOwnConditions({ store, clock: new FixedClock(at) }, { held, notYetKnown });
}

describe("observeRegisterOwnConditions", () => {
  it("starts a condition held for the first time at the current instant", () => {
    const store = new FakeRegisterConditionStartStore();

    expect(observe(store, ["clock_drift"])).toEqual({
      kind: "observed",
      starts: new Map([["clock_drift", NOW]]),
    });
    expect(store.starts).toEqual(new Map([["clock_drift", NOW]]));
  });

  it("keeps the start of a condition that was already held", () => {
    const store = new FakeRegisterConditionStartStore();
    store.starts = new Map([["clock_drift", EARLIER]]);

    expect(observe(store, ["clock_drift"])).toEqual({
      kind: "observed",
      starts: new Map([["clock_drift", EARLIER]]),
    });
    expect(store.starts).toEqual(new Map([["clock_drift", EARLIER]]));
  });

  it("drops a condition that is no longer held, so holding again starts anew", () => {
    const store = new FakeRegisterConditionStartStore();
    store.starts = new Map([["clock_drift", EARLIER]]);
    const later = new Date("2026-10-14T17:00:00.000Z");

    observe(store, []);
    expect(store.starts).toEqual(new Map());

    expect(observe(store, ["clock_drift"], later)).toEqual({
      kind: "observed",
      starts: new Map([["clock_drift", later]]),
    });
  });

  it("answers only the starts of the held conditions, mixing kept and new ones", () => {
    const store = new FakeRegisterConditionStartStore();
    store.starts = new Map([
      ["clock_drift", EARLIER],
      ["wal_oversized", EARLIER],
    ]);

    expect(observe(store, ["clock_drift", "disk_space_low"])).toEqual({
      kind: "observed",
      starts: new Map([
        ["clock_drift", EARLIER],
        ["disk_space_low", NOW],
      ]),
    });
    expect(store.starts).toEqual(
      new Map([
        ["clock_drift", EARLIER],
        ["disk_space_low", NOW],
      ]),
    );
  });

  it("reads the stored starts and replaces them in one transaction, in that order", () => {
    const store = new FakeRegisterConditionStartStore();

    observe(store, ["clock_drift"]);

    expect(store.operationOrder).toEqual(["lockConditionStarts", "replaceConditionStarts"]);
  });

  it("keeps the stored start of a condition not yet known, without answering it", () => {
    const store = new FakeRegisterConditionStartStore();
    store.starts = new Map([
      ["wal_oversized", EARLIER],
      ["clock_drift", EARLIER],
    ]);

    expect(observe(store, ["disk_space_low"], NOW, ["wal_oversized", "battery_low"])).toEqual({
      kind: "observed",
      starts: new Map([["disk_space_low", NOW]]),
    });
    expect(store.starts).toEqual(
      new Map([
        ["wal_oversized", EARLIER],
        ["disk_space_low", NOW],
      ]),
    );
  });

  it("answers the start of a held condition even while it is named not yet known", () => {
    const store = new FakeRegisterConditionStartStore();
    store.starts = new Map([["wal_oversized", EARLIER]]);

    expect(
      observe(store, ["wal_oversized", "battery_low"], NOW, ["wal_oversized", "battery_low"]),
    ).toEqual({
      kind: "observed",
      starts: new Map([
        ["wal_oversized", EARLIER],
        ["battery_low", NOW],
      ]),
    });
    expect(store.starts).toEqual(
      new Map([
        ["wal_oversized", EARLIER],
        ["battery_low", NOW],
      ]),
    );
  });

  it("writes nothing when the held conditions are those already stored", () => {
    const store = new FakeRegisterConditionStartStore();
    store.starts = new Map([
      ["clock_drift", EARLIER],
      ["wal_oversized", EARLIER],
    ]);

    observe(store, ["clock_drift"], NOW, ["wal_oversized"]);

    expect(store.operationOrder).toEqual(["lockConditionStarts"]);
  });

  it("writes when a stored condition stops holding even though as many conditions hold", () => {
    const store = new FakeRegisterConditionStartStore();
    store.starts = new Map([["clock_drift", EARLIER]]);

    observe(store, ["wal_oversized"]);

    expect(store.operationOrder).toEqual(["lockConditionStarts", "replaceConditionStarts"]);
    expect(store.starts).toEqual(new Map([["wal_oversized", NOW]]));
  });

  it("answers the stored and new starts, and the failure, when they cannot be recorded", () => {
    const store = new FakeRegisterConditionStartStore();
    store.starts = new Map([["clock_drift", EARLIER]]);
    store.failingReplace = true;

    expect(observe(store, ["clock_drift", "disk_space_low"])).toEqual({
      kind: "starts_not_recorded",
      starts: new Map([
        ["clock_drift", EARLIER],
        ["disk_space_low", NOW],
      ]),
      failure: new Error("replaceConditionStarts failed"),
    });
    expect(store.starts).toEqual(new Map([["clock_drift", EARLIER]]));
  });

  it("answers every held condition from the current instant, and the failure, when the stored starts cannot be read", () => {
    const store = new FakeRegisterConditionStartStore();
    store.starts = new Map([["clock_drift", EARLIER]]);
    store.failingLock = true;

    expect(observe(store, ["clock_drift", "disk_space_low"])).toEqual({
      kind: "starts_not_recorded",
      starts: new Map([
        ["clock_drift", NOW],
        ["disk_space_low", NOW],
      ]),
      failure: new Error("lockConditionStarts failed"),
    });
    expect(store.starts).toEqual(new Map([["clock_drift", EARLIER]]));
  });
});
