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

const AFTER_DEADLINE = new Date("2026-10-14T15:00:00.000Z");

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

  it("looks only at the night due at the time, not at later or earlier ones", async () => {
    const { checks, outcome } = detect(
      {
        "2026-10-13": { status: "failed", reason: "object_missing" },
        "2026-10-15": { status: "failed", reason: "object_missing" },
      },
      new Date("2026-10-14T14:59:59.999Z"),
    );

    await outcome;
    expect(checks.reads).toEqual(["2026-10-13"]);
  });

  it("is not unverified before the deadline of the night that just ran: the previous night is still the one due", async () => {
    const { outcome } = detect(
      { "2026-10-13": { status: "verified", sizeBytes: 1_000 } },
      new Date("2026-10-14T12:00:00.000Z"),
    );

    await expect(outcome).resolves.toEqual({ kind: "verified", night: "2026-10-13" });
  });
});
