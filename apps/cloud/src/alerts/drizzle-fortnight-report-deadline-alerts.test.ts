import type { NewAlert } from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";
import { DrizzleFortnightReportDeadlineAlerts } from "./drizzle-fortnight-report-deadline-alerts.js";

const NOW = new Date("2026-09-24T15:00:00.000Z");
const SCOPE = "4:2026-09-01";
const PRESENTATION = {
  pointOfSaleNumber: 4,
  registerId: "register-1",
  fortnightStart: "2026-09-01",
  fortnightEnd: "2026-09-15",
  deadline: "2026-09-23",
};

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

function pendingAlert(overrides: Partial<NewAlert> = {}): NewAlert {
  return {
    kind: "fortnight_report_pending",
    scope: SCOPE,
    level: "warning",
    audience: "all",
    locationId: null,
    detail: { ...PRESENTATION, daysLeft: 3, reason: "pending" },
    openedAt: NOW,
    escalateAt: null,
    deduplicates: true,
    ...overrides,
  };
}

function overdueAlert(overrides: Partial<NewAlert> = {}): NewAlert {
  return pendingAlert({
    kind: "fortnight_report_overdue",
    level: "critical",
    detail: PRESENTATION,
    ...overrides,
  });
}

function insert(alert: NewAlert): Promise<string> {
  return new DrizzleAlertStore(db, () => NOW).transaction((tx) => tx.insertAlert(alert));
}

function deadlineAlerts() {
  return new DrizzleFortnightReportDeadlineAlerts(db, () => NOW);
}

describe("DrizzleFortnightReportDeadlineAlerts pendingAlertScopes", () => {
  it("lists the scopes of the open pending alerts only", async () => {
    await insert(pendingAlert());
    await insert(overdueAlert({ scope: "5:2026-09-01" }));

    await expect(deadlineAlerts().pendingAlertScopes()).resolves.toEqual([SCOPE]);
  });

  it("leaves out a pending alert already resolved", async () => {
    const id = await insert(pendingAlert());
    await db.update(alerts).set({ resolvedAt: NOW }).where(eq(alerts.id, id));

    await expect(deadlineAlerts().pendingAlertScopes()).resolves.toEqual([]);
  });
});

describe("DrizzleFortnightReportDeadlineAlerts observeAlertCondition", () => {
  it("opens a pending alert at the level it is observed at, by the clock it is handed", async () => {
    await deadlineAlerts().observeAlertCondition({
      holds: true,
      level: "critical",
      alert: {
        kind: "fortnight_report_pending",
        scope: SCOPE,
        detail: { ...PRESENTATION, daysLeft: 1, reason: "blocked" },
      },
    });

    await expect(
      db
        .select({
          scope: alerts.scope,
          level: alerts.level,
          audience: alerts.audience,
          detail: alerts.detail,
          openedAt: alerts.openedAt,
        })
        .from(alerts),
    ).resolves.toEqual([
      {
        scope: SCOPE,
        level: "critical",
        audience: "all",
        detail: { ...PRESENTATION, daysLeft: 1, reason: "blocked" },
        openedAt: NOW,
      },
    ]);
  });

  it("marks the open pending alert of a presentation no longer pending as cleared", async () => {
    await insert(pendingAlert());

    await deadlineAlerts().observeAlertCondition({
      holds: false,
      kind: "fortnight_report_pending",
      scope: SCOPE,
    });

    await expect(
      db.select({ conditionClearedAt: alerts.conditionClearedAt }).from(alerts),
    ).resolves.toEqual([{ conditionClearedAt: NOW }]);
  });
});

describe("DrizzleFortnightReportDeadlineAlerts hasOpenedOverdueAlert", () => {
  it("is false while no overdue alert was opened for the scope", async () => {
    await insert(overdueAlert({ scope: "5:2026-09-01" }));
    await insert(pendingAlert());

    await expect(deadlineAlerts().hasOpenedOverdueAlert(SCOPE)).resolves.toBe(false);
  });

  it("is true while the overdue alert of the scope is open", async () => {
    await insert(overdueAlert());

    await expect(deadlineAlerts().hasOpenedOverdueAlert(SCOPE)).resolves.toBe(true);
  });

  it("stays true after a person closed the overdue alert", async () => {
    const id = await insert(overdueAlert());
    await db.update(alerts).set({ resolvedAt: NOW }).where(eq(alerts.id, id));

    await expect(deadlineAlerts().hasOpenedOverdueAlert(SCOPE)).resolves.toBe(true);
  });
});

describe("DrizzleFortnightReportDeadlineAlerts openOverdueAlert", () => {
  it("opens a critical alert for everyone, by the clock it is handed, that nothing closes by itself", async () => {
    await deadlineAlerts().openOverdueAlert({
      kind: "fortnight_report_overdue",
      scope: SCOPE,
      detail: PRESENTATION,
    });

    await expect(
      db
        .select({
          kind: alerts.kind,
          scope: alerts.scope,
          level: alerts.level,
          audience: alerts.audience,
          detail: alerts.detail,
          openedAt: alerts.openedAt,
          resolvedAt: alerts.resolvedAt,
        })
        .from(alerts),
    ).resolves.toEqual([
      {
        kind: "fortnight_report_overdue",
        scope: SCOPE,
        level: "critical",
        audience: "all",
        detail: PRESENTATION,
        openedAt: NOW,
        resolvedAt: null,
      },
    ]);
  });
});
