import type { NewAlert } from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";
import { DrizzleFortnightReportRegularizationAlerts } from "./drizzle-fortnight-report-regularization-alerts.js";

const NOW = new Date("2026-09-24T15:00:00.000Z");
const SCOPE = "4:2026-09-01";
const PRESENTATION = {
  pointOfSaleNumber: 4,
  registerId: "register-1",
  fortnightStart: "2026-09-01",
  fortnightEnd: "2026-09-15",
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

function regularizationAlert(overrides: Partial<NewAlert> = {}): NewAlert {
  return {
    kind: "fortnight_report_needs_regularization",
    scope: SCOPE,
    level: "critical",
    audience: "all",
    locationId: null,
    detail: PRESENTATION,
    openedAt: NOW,
    escalateAt: null,
    deduplicates: true,
    ...overrides,
  };
}

function insert(alert: NewAlert): Promise<string> {
  return new DrizzleAlertStore(db, () => NOW).transaction((tx) => tx.insertAlert(alert));
}

function regularizationAlerts() {
  return new DrizzleFortnightReportRegularizationAlerts(db, () => NOW);
}

describe("DrizzleFortnightReportRegularizationAlerts hasOpenedRegularizationAlert", () => {
  it("is false while no such alert was opened for the scope", async () => {
    await insert(regularizationAlert({ scope: "5:2026-09-01" }));
    await insert(
      regularizationAlert({
        kind: "fortnight_report_overdue",
        detail: { ...PRESENTATION, deadline: "2026-09-23" },
      }),
    );

    await expect(regularizationAlerts().hasOpenedRegularizationAlert(SCOPE)).resolves.toBe(false);
  });

  it("is true while the alert of the scope is open", async () => {
    await insert(regularizationAlert());

    await expect(regularizationAlerts().hasOpenedRegularizationAlert(SCOPE)).resolves.toBe(true);
  });

  it("stays true after a person closed the alert", async () => {
    const id = await insert(regularizationAlert());
    await db.update(alerts).set({ resolvedAt: NOW }).where(eq(alerts.id, id));

    await expect(regularizationAlerts().hasOpenedRegularizationAlert(SCOPE)).resolves.toBe(true);
  });
});

describe("DrizzleFortnightReportRegularizationAlerts openRegularizationAlert", () => {
  it("opens a critical alert for everyone, by the clock it is handed, that nothing closes by itself", async () => {
    await regularizationAlerts().openRegularizationAlert({
      kind: "fortnight_report_needs_regularization",
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
        kind: "fortnight_report_needs_regularization",
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
