import { describe, expect, it } from "vitest";
import { observeRegisterOwnConditions } from "./observe-register-own-conditions.js";
import { FakeRegisterConditionStartStore } from "./test-support/fake-register-condition-start-store.js";
import { FixedClock } from "./test-support/fake-register-store.js";

const EARLIER = new Date("2026-10-14T15:00:00.000Z");
const NOW = new Date("2026-10-14T16:00:00.000Z");

function observe(store: FakeRegisterConditionStartStore, held: readonly string[], at = NOW) {
  return observeRegisterOwnConditions({ store, clock: new FixedClock(at) }, { held });
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

  it("leaves the stored starts as they were when the replacement fails", () => {
    const store = new FakeRegisterConditionStartStore();
    store.starts = new Map([["clock_drift", EARLIER]]);
    store.failingReplace = true;

    expect(() => observe(store, ["disk_space_low"])).toThrow("replaceConditionStarts failed");

    expect(store.starts).toEqual(new Map([["clock_drift", EARLIER]]));
  });
});
