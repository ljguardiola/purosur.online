import type { NewAlert } from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";
import { DrizzleOwedElsewhereAlerts } from "./drizzle-owed-elsewhere-alerts.js";

const NOW = new Date("2026-09-24T15:00:00.000Z");
const SCOPE = "9:2026-09-01";
const DETAIL = { pointOfSaleNumber: 9, fortnightStart: "2026-09-01", fortnightEnd: "2026-09-15" };

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

function owedElsewhereAlert(overrides: Partial<NewAlert> = {}): NewAlert {
  return {
    kind: "fortnight_report_owed_elsewhere",
    scope: SCOPE,
    level: "critical",
    audience: "all",
    locationId: null,
    detail: DETAIL,
    openedAt: NOW,
    escalateAt: null,
    deduplicates: true,
    ...overrides,
  };
}

function insert(alert: NewAlert): Promise<string> {
  return new DrizzleAlertStore(db, () => NOW).transaction((tx) => tx.insertAlert(alert));
}

function owedElsewhereAlerts() {
  return new DrizzleOwedElsewhereAlerts(db, () => NOW);
}

describe("DrizzleOwedElsewhereAlerts owedElsewhereAlertScopes", () => {
  it("lists the scopes of the open owed elsewhere alerts only", async () => {
    await insert(owedElsewhereAlert());
    await insert(
      owedElsewhereAlert({
        kind: "fortnight_report_overdue",
        scope: "4:2026-09-01",
        detail: { ...DETAIL, registerId: "register-1", deadline: "2026-09-23" },
      }),
    );

    await expect(owedElsewhereAlerts().owedElsewhereAlertScopes()).resolves.toEqual([SCOPE]);
  });

  it("leaves out an alert already resolved", async () => {
    const id = await insert(owedElsewhereAlert());
    await db.update(alerts).set({ resolvedAt: NOW }).where(eq(alerts.id, id));

    await expect(owedElsewhereAlerts().owedElsewhereAlertScopes()).resolves.toEqual([]);
  });
});

describe("DrizzleOwedElsewhereAlerts observeAlertCondition", () => {
  it("opens a critical alert for everyone naming the point of sale and fortnight, by the clock it is handed", async () => {
    await owedElsewhereAlerts().observeAlertCondition({
      holds: true,
      alert: { kind: "fortnight_report_owed_elsewhere", scope: SCOPE, detail: DETAIL },
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
        })
        .from(alerts),
    ).resolves.toEqual([
      {
        kind: "fortnight_report_owed_elsewhere",
        scope: SCOPE,
        level: "critical",
        audience: "all",
        detail: DETAIL,
        openedAt: NOW,
      },
    ]);
  });

  it("opens one alert however many times the same presentation is observed", async () => {
    const observation = {
      holds: true,
      alert: { kind: "fortnight_report_owed_elsewhere", scope: SCOPE, detail: DETAIL },
    } as const;

    await owedElsewhereAlerts().observeAlertCondition(observation);
    await owedElsewhereAlerts().observeAlertCondition(observation);

    await expect(db.select({ id: alerts.id }).from(alerts)).resolves.toHaveLength(1);
  });

  it("marks the open alert of a presentation no longer owed as cleared", async () => {
    await insert(owedElsewhereAlert());

    await owedElsewhereAlerts().observeAlertCondition({
      holds: false,
      kind: "fortnight_report_owed_elsewhere",
      scope: SCOPE,
    });

    await expect(
      db.select({ conditionClearedAt: alerts.conditionClearedAt }).from(alerts),
    ).resolves.toEqual([{ conditionClearedAt: NOW }]);
  });
});
