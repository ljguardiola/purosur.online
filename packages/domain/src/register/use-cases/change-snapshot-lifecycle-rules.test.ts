import { describe, expect, it } from "vitest";
import { DEFAULT_SNAPSHOT_LIFECYCLE_RULES } from "../model/snapshot-lifecycle-rules.js";
import { changeSnapshotLifecycleRules } from "./change-snapshot-lifecycle-rules.js";
import { FakeSnapshotLifecycleRulesStore } from "./test-support/fake-snapshot-lifecycle-rules-store.js";

const STORED = { hourly: 12, daily: 14, monthly: 6 };
const NEW_RULES = { hourly: 48, daily: 60, monthly: 18 };

function change(store: FakeSnapshotLifecycleRulesStore, rules = NEW_RULES) {
  return changeSnapshotLifecycleRules({ store }, { rules, actorId: "actor-1" });
}

describe("changeSnapshotLifecycleRules", () => {
  it("stores the new rules and answers them", async () => {
    const store = new FakeSnapshotLifecycleRulesStore();
    store.seedRules(STORED);

    expect(await change(store)).toEqual({ kind: "changed", rules: NEW_RULES });
    expect(store.snapshot().rules).toEqual(NEW_RULES);
  });

  it("records the previous and the new rules with the actor", async () => {
    const store = new FakeSnapshotLifecycleRulesStore();
    store.seedRules(STORED);

    await change(store);

    expect(store.snapshot().changes).toEqual([
      { previous: STORED, next: NEW_RULES, actorId: "actor-1" },
    ]);
  });

  it("takes the defaults as the previous rules when none were stored", async () => {
    const store = new FakeSnapshotLifecycleRulesStore();

    await change(store);

    expect(store.snapshot().changes).toEqual([
      { previous: DEFAULT_SNAPSHOT_LIFECYCLE_RULES, next: NEW_RULES, actorId: "actor-1" },
    ]);
  });

  it("locks the rules before writing them", async () => {
    const store = new FakeSnapshotLifecycleRulesStore();

    await change(store);

    expect(store.operationOrder).toEqual(["lockLifecycleRules", "recordLifecycleRulesChange"]);
  });

  it("changes nothing when the rules equal the stored ones", async () => {
    const store = new FakeSnapshotLifecycleRulesStore();
    store.seedRules(STORED);

    expect(await change(store, { ...STORED })).toEqual({ kind: "unchanged" });
    expect(store.snapshot().changes).toEqual([]);
    expect(store.operationOrder).toEqual(["lockLifecycleRules"]);
  });

  it.each([
    ["hours", { ...STORED, hourly: 13 }],
    ["days", { ...STORED, daily: 15 }],
    ["months", { ...STORED, monthly: 7 }],
  ])("changes the rules when only the %s differ", async (_name, rules) => {
    const store = new FakeSnapshotLifecycleRulesStore();
    store.seedRules(STORED);

    expect(await change(store, rules)).toEqual({ kind: "changed", rules });
    expect(store.snapshot().rules).toEqual(rules);
  });

  it("changes nothing when none were stored and the rules equal the defaults", async () => {
    const store = new FakeSnapshotLifecycleRulesStore();

    expect(await change(store, { ...DEFAULT_SNAPSHOT_LIFECYCLE_RULES })).toEqual({
      kind: "unchanged",
    });
    expect(store.snapshot()).toEqual({ rules: undefined, changes: [] });
  });

  it.each([
    ["hours", { ...NEW_RULES, hourly: 73 }],
    ["days", { ...NEW_RULES, daily: 0 }],
    ["months", { ...NEW_RULES, monthly: 2.5 }],
  ])("refuses rules whose %s are out of limits, before reading anything", async (_name, rules) => {
    const store = new FakeSnapshotLifecycleRulesStore();
    store.seedRules(STORED);

    expect(await change(store, rules)).toEqual({ kind: "out_of_limits" });
    expect(store.operationOrder).toEqual([]);
    expect(store.snapshot().rules).toEqual(STORED);
  });

  it("leaves the stored rules as they were when the audit record cannot be written", async () => {
    const store = new FakeSnapshotLifecycleRulesStore();
    store.seedRules(STORED);
    store.failingAudit = true;

    await expect(change(store)).rejects.toThrow("recordLifecycleRulesChange failed");
    expect(store.snapshot()).toEqual({ rules: STORED, changes: [] });
  });
});
