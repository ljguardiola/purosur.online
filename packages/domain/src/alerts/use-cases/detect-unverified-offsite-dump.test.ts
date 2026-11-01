import { describe, expect, it } from "vitest";
import {
  OFFSITE_DUMP_SHRINK_THRESHOLD_PERCENT,
  type OffsiteDumpCheckResult,
} from "../../backups/index.js";
import { detectUnverifiedOffsiteDump } from "./detect-unverified-offsite-dump.js";
import { FixedClock } from "./test-support/fake-alert-store.js";
import {
  FakeOffsiteDumpAlerts,
  FakeOffsiteDumpCheckReader,
} from "./test-support/fake-offsite-dump-alerts.js";

const AFTER_DEADLINE = new Date("2026-10-14T21:00:00.000Z");

function detect(results: Record<string, OffsiteDumpCheckResult>, now = AFTER_DEADLINE) {
  const checks = new FakeOffsiteDumpCheckReader(results);
  const alerts = new FakeOffsiteDumpAlerts();
  const outcome = detectUnverifiedOffsiteDump(
    { checks, alerts, clock: new FixedClock(now) },
    { environment: "production" },
  );
  return { checks, alerts, outcome };
}

describe("detectUnverifiedOffsiteDump", () => {
  it("keeps the alert open as not reported when the due night has no recorded check", async () => {
    const { alerts, outcome } = detect({
      "2026-10-13": { status: "verified", sizeBytes: 1_000 },
    });

    await expect(outcome).resolves.toEqual({
      kind: "unverified",
      night: "2026-10-14",
      reason: "not_reported",
    });
    expect(alerts.observations).toEqual([
      {
        holds: true,
        alert: {
          kind: "offsite_dump_unverified",
          scope: "production",
          detail: { night: "2026-10-14", reason: "not_reported" },
        },
      },
    ]);
  });

  it("opens the alert with the reason of the failed check of the due night", async () => {
    const { alerts, outcome } = detect({
      "2026-10-14": { status: "failed", reason: "shrank", sizeBytes: 400 },
    });

    await expect(outcome).resolves.toEqual({
      kind: "unverified",
      night: "2026-10-14",
      reason: "shrank",
    });
    expect(alerts.observations).toEqual([
      {
        holds: true,
        alert: {
          kind: "offsite_dump_unverified",
          scope: "production",
          detail: {
            night: "2026-10-14",
            reason: "shrank",
            shrinkThresholdPercent: OFFSITE_DUMP_SHRINK_THRESHOLD_PERCENT,
          },
        },
      },
    ]);
  });

  it("clears the alert when the due night is verified", async () => {
    const { alerts, outcome } = detect({
      "2026-10-14": { status: "verified", sizeBytes: 1_000 },
    });

    await expect(outcome).resolves.toEqual({ kind: "verified", night: "2026-10-14" });
    expect(alerts.observations).toEqual([
      { holds: false, kind: "offsite_dump_unverified", scope: "production" },
    ]);
  });

  it("reads only the night of the day and the night due, not later or earlier ones", async () => {
    const { checks, outcome } = detect(
      {
        "2026-10-12": { status: "failed", reason: "object_missing" },
        "2026-10-15": { status: "failed", reason: "object_missing" },
      },
      new Date("2026-10-14T20:59:59.999Z"),
    );

    await outcome;
    expect(checks.reads).toEqual(["2026-10-14", "2026-10-13"]);
  });

  it("raises a failure the check reports in the morning at the next run, long before the deadline", async () => {
    const { outcome } = detect(
      {
        "2026-10-13": { status: "verified", sizeBytes: 1_000 },
        "2026-10-14": { status: "failed", reason: "object_missing" },
      },
      new Date("2026-10-14T11:00:00.000Z"),
    );

    await expect(outcome).resolves.toEqual({
      kind: "unverified",
      night: "2026-10-14",
      reason: "object_missing",
    });
  });

  it.each([
    "2026-10-14T00:00:00.000Z",
    "2026-10-14T05:00:00.000Z",
    "2026-10-14T12:00:00.000Z",
    "2026-10-14T15:00:00.000Z",
    "2026-10-14T16:00:00.000Z",
    "2026-10-14T20:59:59.999Z",
  ])("keeps the previous verified night as the one judged at %s while the day's night has no report", async (now) => {
    const { outcome } = detect(
      { "2026-10-13": { status: "verified", sizeBytes: 1_000 } },
      new Date(now),
    );

    await expect(outcome).resolves.toEqual({ kind: "verified", night: "2026-10-13" });
  });

  it.each([
    "2026-10-14T17:00:00.000Z",
    "2026-10-14T21:00:00.000Z",
    "2026-10-14T23:00:00.000Z",
  ])("judges the day's night verified at %s once a check started hours late verifies it", async (now) => {
    const { outcome } = detect(
      {
        "2026-10-13": { status: "verified", sizeBytes: 1_000 },
        "2026-10-14": { status: "verified", sizeBytes: 1_000 },
      },
      new Date(now),
    );

    await expect(outcome).resolves.toEqual({ kind: "verified", night: "2026-10-14" });
  });

  it("opens the alert as not reported at the deadline when the day's night still has no report", async () => {
    const { outcome } = detect(
      { "2026-10-13": { status: "verified", sizeBytes: 1_000 } },
      new Date("2026-10-14T21:00:00.000Z"),
    );

    await expect(outcome).resolves.toEqual({
      kind: "unverified",
      night: "2026-10-14",
      reason: "not_reported",
    });
  });

  it("clears the alert when a rerun of the check verifies a night it first reported failed", async () => {
    const failedFirst = detect(
      { "2026-10-14": { status: "failed", reason: "hash_mismatch" } },
      new Date("2026-10-14T11:00:00.000Z"),
    );
    await expect(failedFirst.outcome).resolves.toMatchObject({ kind: "unverified" });

    const { alerts, outcome } = detect(
      { "2026-10-14": { status: "verified", sizeBytes: 1_000 } },
      new Date("2026-10-14T13:00:00.000Z"),
    );

    await expect(outcome).resolves.toEqual({ kind: "verified", night: "2026-10-14" });
    expect(alerts.observations).toEqual([
      { holds: false, kind: "offsite_dump_unverified", scope: "production" },
    ]);
  });

  it("judges the previous night after midnight, before the day's dump has run", async () => {
    const { outcome } = detect(
      { "2026-10-13": { status: "failed", reason: "size_mismatch" } },
      new Date("2026-10-14T05:00:00.000Z"),
    );

    await expect(outcome).resolves.toEqual({
      kind: "unverified",
      night: "2026-10-13",
      reason: "size_mismatch",
    });
  });
});
