import { describe, expect, it } from "vitest";
import { argentinaInstant } from "../../shared/index.js";
import type { Fortnight } from "../model/offline-authorization-code.js";
import type {
  FortnightAcquisitionOutcome,
  ObtainOfflineAuthorizationCodesOutcome,
} from "./obtain-offline-authorization-codes.js";
import { reportOfflineAuthorizationCodeAcquisitionFailures } from "./report-offline-authorization-code-acquisition-failures.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  FakeAcquisitionFailureNotifier,
  FakeAcquisitionFailureReportStore,
} from "./test-support/fake-offline-authorization-code-acquisition-reports.js";

const FIRST_HALF: Fortnight = { start: "2026-10-01", end: "2026-10-15" };
const SECOND_HALF: Fortnight = { start: "2026-10-16", end: "2026-10-31" };
const REJECTION = { code: 15006, message: "Fictional rejection" };

const BEFORE_WINDOW = "2026-10-10";
const INFORMATIONAL_DAY = "2026-10-11";
const WARNING_DAY = "2026-10-13";
const CRITICAL_DAY = "2026-10-15";
const AFTER_FORTNIGHT = "2026-11-01";

function at(day: string): Date {
  return new Date(argentinaInstant(day, "12:00"));
}

function attempted(
  ...fortnights: [Fortnight, FortnightAcquisitionOutcome][]
): ObtainOfflineAuthorizationCodesOutcome {
  return {
    kind: "attempted",
    fortnights: fortnights.map(([fortnight, outcome]) => ({ fortnight, outcome })),
  };
}

function setUp(day: string) {
  const store = new FakeAcquisitionFailureReportStore();
  const notifier = new FakeAcquisitionFailureNotifier(store.events);
  const clock = new ManualClock(at(day));
  const report = (outcome: ObtainOfflineAuthorizationCodesOutcome) =>
    reportOfflineAuthorizationCodeAcquisitionFailures(outcome, { store, notifier, clock });
  return { store, notifier, report };
}

const FAILURES: [string, FortnightAcquisitionOutcome][] = [
  ["refused", { kind: "refused", rejections: [REJECTION] }],
  ["no_answer", { kind: "no_answer" }],
  ["not_recovered", { kind: "not_recovered" }],
];

describe("reportOfflineAuthorizationCodeAcquisitionFailures", () => {
  it.each(FAILURES)(
    "notifies a %s outcome as due, naming the outcome and the urgency",
    async (_kind, outcome) => {
      const { notifier, report } = setUp(WARNING_DAY);

      await expect(report(attempted([SECOND_HALF, outcome]))).resolves.toBe(1);

      expect(notifier.notices).toEqual([{ fortnight: SECOND_HALF, outcome, urgency: "due" }]);
    },
  );

  it.each(FAILURES)("notifies a %s outcome as pressing", async (_kind, outcome) => {
    const { notifier, report } = setUp(CRITICAL_DAY);

    await report(attempted([SECOND_HALF, outcome]));

    expect(notifier.notices).toEqual([{ fortnight: SECOND_HALF, outcome, urgency: "pressing" }]);
  });

  it.each([
    ["as early", INFORMATIONAL_DAY],
    ["before the fortnight's window opens", BEFORE_WINDOW],
    ["after the fortnight ended", AFTER_FORTNIGHT],
  ])("neither records nor notifies a failure %s", async (_name, day) => {
    const { store, notifier, report } = setUp(day);

    await expect(report(attempted([SECOND_HALF, { kind: "no_answer" }]))).resolves.toBe(0);

    expect(store.events).toEqual([]);
    expect(notifier.notices).toEqual([]);
  });

  it.each<FortnightAcquisitionOutcome>([
    { kind: "obtained" },
    { kind: "recovered" },
    { kind: "held" },
    { kind: "no_token" },
    { kind: "unexpected_fortnight" },
  ])("ignores a $kind outcome even as pressing", async (outcome) => {
    const { store, notifier, report } = setUp(CRITICAL_DAY);

    await report(attempted([SECOND_HALF, outcome]));

    expect(store.events).toEqual([]);
    expect(notifier.notices).toEqual([]);
  });

  it("does nothing when no register has an offline point of sale", async () => {
    const { store, notifier, report } = setUp(CRITICAL_DAY);

    await expect(report({ kind: "no_offline_point_of_sale" })).resolves.toBe(0);

    expect(store.events).toEqual([]);
    expect(notifier.notices).toEqual([]);
  });

  it("notifies the same fortnight and outcome kind once across repeated runs", async () => {
    const { notifier, report } = setUp(WARNING_DAY);
    const run = attempted([SECOND_HALF, { kind: "refused", rejections: [REJECTION] }]);

    await expect(report(run)).resolves.toBe(1);
    await expect(report(run)).resolves.toBe(0);

    expect(notifier.notices).toHaveLength(1);
  });

  it("notifies again when the same fortnight fails in a different way", async () => {
    const { notifier, report } = setUp(WARNING_DAY);
    await report(attempted([SECOND_HALF, { kind: "no_answer" }]));

    await report(attempted([SECOND_HALF, { kind: "not_recovered" }]));

    expect(notifier.notices.map(({ outcome }) => outcome.kind)).toEqual([
      "no_answer",
      "not_recovered",
    ]);
  });

  it("reports each failing fortnight on its own urgency", async () => {
    const { notifier, report } = setUp(WARNING_DAY);

    await expect(
      report(attempted([FIRST_HALF, { kind: "no_answer" }], [SECOND_HALF, { kind: "no_answer" }])),
    ).resolves.toBe(2);

    expect(notifier.notices.map(({ fortnight, urgency }) => [fortnight.start, urgency])).toEqual([
      ["2026-10-01", "pressing"],
      ["2026-10-16", "due"],
    ]);
  });

  it("records the report before notifying", async () => {
    const { store, report } = setUp(WARNING_DAY);

    await report(attempted([SECOND_HALF, { kind: "no_answer" }]));

    expect(store.events).toEqual(["record 2026-10-16:no_answer", "notify 2026-10-16:no_answer"]);
  });
});
