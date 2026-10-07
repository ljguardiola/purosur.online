import { describe, expect, it } from "vitest";
import { checkArcaVitality } from "./check-arca-vitality.js";
import {
  FakeArcaVitalityService,
  FakeArcaVitalityStore,
  ManualClock,
} from "./test-support/fake-arca-vitality.js";

const START = new Date("2026-10-01T12:00:00.000Z");
const ANSWER_DELAY_MS = 2_500;
const ANSWERED_AT = new Date(START.getTime() + ANSWER_DELAY_MS);

function check(result: ConstructorParameters<typeof FakeArcaVitalityService>[0]) {
  const clock = new ManualClock(START);
  const store = new FakeArcaVitalityStore();
  const vitality = new FakeArcaVitalityService(result, () => clock.advanceBy(ANSWER_DELAY_MS));
  return { store, outcome: checkArcaVitality({ vitality, store, clock }) };
}

describe("checkArcaVitality", () => {
  it("is ok and records an ok check when every server reports OK", async () => {
    const { store, outcome } = check({
      kind: "answered",
      appServer: "OK",
      dbServer: "OK",
      authServer: "OK",
    });

    await expect(outcome).resolves.toEqual({ kind: "ok" });
    expect(store.checks).toEqual([{ checkedAt: ANSWERED_AT, ok: true }]);
  });

  it.each([
    { appServer: "NOT OK", dbServer: "OK", authServer: "OK" },
    { appServer: "OK", dbServer: "NOT OK", authServer: "OK" },
    { appServer: "OK", dbServer: "OK", authServer: "NOT OK" },
  ])("is not ok and records a failed check when a server does not report OK: %o", async (answer) => {
    const { store, outcome } = check({ kind: "answered", ...answer });

    await expect(outcome).resolves.toEqual({ kind: "not_ok" });
    expect(store.checks).toEqual([{ checkedAt: ANSWERED_AT, ok: false }]);
  });

  it("is not ok and records a failed check, stamped when the failure arrived, when ARCA is unreachable", async () => {
    const { store, outcome } = check({ kind: "unreachable" });

    await expect(outcome).resolves.toEqual({ kind: "not_ok" });
    expect(store.checks).toEqual([{ checkedAt: ANSWERED_AT, ok: false }]);
  });
});
