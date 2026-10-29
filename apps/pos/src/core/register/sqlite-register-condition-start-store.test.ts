import { describe, expect, it } from "vitest";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { fixedZoneRulesSource } from "../platform/test-support/fixed-zone-rules-source.js";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteRegisterConditionStartStore } from "./sqlite-register-condition-start-store";

const SINCE = new Date("2026-10-29T12:30:00.000Z");
const OTHER = new Date("2026-10-29T13:45:10.250Z");

function aStore() {
  const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  return {
    database,
    store: new SqliteRegisterConditionStartStore(database, fixedZoneRulesSource()),
  };
}

describe("SqliteRegisterConditionStartStore", () => {
  it("starts with no condition start", () => {
    const { store } = aStore();

    expect(store.transaction((tx) => tx.lockConditionStarts())).toEqual(new Map());
  });

  it("reads back the instants it replaced the starts with", () => {
    const { store } = aStore();

    store.transaction((tx) =>
      tx.replaceConditionStarts(
        new Map([
          ["clock_drift", SINCE],
          ["sales_denied:disk_full", OTHER],
        ]),
      ),
    );

    expect(store.transaction((tx) => tx.lockConditionStarts())).toEqual(
      new Map([
        ["clock_drift", SINCE],
        ["sales_denied:disk_full", OTHER],
      ]),
    );
  });

  it("keeps the instants in Argentina time", () => {
    const { database, store } = aStore();

    store.transaction((tx) => tx.replaceConditionStarts(new Map([["clock_drift", SINCE]])));

    expect(
      database.prepare("SELECT condition, since FROM register_condition_starts").all(),
    ).toEqual([{ condition: "clock_drift", since: "2026-10-29T09:30:00.000-03:00" }]);
  });

  it("replaces every stored start, dropping the conditions left out", () => {
    const { store } = aStore();
    store.transaction((tx) =>
      tx.replaceConditionStarts(
        new Map([
          ["clock_drift", SINCE],
          ["wal_oversized", SINCE],
        ]),
      ),
    );

    store.transaction((tx) => tx.replaceConditionStarts(new Map([["wal_oversized", OTHER]])));

    expect(store.transaction((tx) => tx.lockConditionStarts())).toEqual(
      new Map([["wal_oversized", OTHER]]),
    );
  });

  it("rolls the replacement back when the work fails", () => {
    const { store } = aStore();
    store.transaction((tx) => tx.replaceConditionStarts(new Map([["clock_drift", SINCE]])));

    expect(() =>
      store.transaction((tx) => {
        tx.replaceConditionStarts(new Map([["wal_oversized", OTHER]]));
        throw new Error("interrupted");
      }),
    ).toThrow("interrupted");

    expect(store.transaction((tx) => tx.lockConditionStarts())).toEqual(
      new Map([["clock_drift", SINCE]]),
    );
  });
});
