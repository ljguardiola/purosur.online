import type { AlertConditionObservation } from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleSecondMonthAtRiskAlerts } from "./drizzle-second-month-at-risk-alerts.js";

const NOW = new Date("2026-11-07T15:00:00.000Z");
const FISCAL_ADDRESS_ID = "0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f";
const SCOPE = `${FISCAL_ADDRESS_ID}:2026-11`;

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

function holdingWith(
  figures: { exceptionCount: number; totalCount: number; shareTenthsOfPercent: number } = {
    exceptionCount: 1,
    totalCount: 10,
    shareTenthsOfPercent: 100,
  },
): AlertConditionObservation {
  return {
    holds: true,
    alert: {
      kind: "exception_share_second_month_at_risk",
      scope: SCOPE,
      detail: {
        fiscalAddressId: FISCAL_ADDRESS_ID,
        fiscalAddressName: "Depósito Central",
        month: "2026-11",
        previousMonth: "2026-10",
        nonCompliancePercent: 5,
        ...figures,
      },
    },
  };
}

describe("DrizzleSecondMonthAtRiskAlerts", () => {
  it("opens a warning for everyone with the detail it is handed and lists its scope while it is open", async () => {
    const atRisk = new DrizzleSecondMonthAtRiskAlerts(db, () => NOW);

    await atRisk.observeAlertCondition(holdingWith());

    expect(await atRisk.atRiskAlertScopes()).toEqual([SCOPE]);
    const [row] = await db.select().from(alerts);
    expect(row).toMatchObject({
      kind: "exception_share_second_month_at_risk",
      scope: SCOPE,
      level: "warning",
      audience: "all",
      resolvedAt: null,
      detail: {
        fiscalAddressId: FISCAL_ADDRESS_ID,
        fiscalAddressName: "Depósito Central",
        month: "2026-11",
        previousMonth: "2026-10",
        exceptionCount: 1,
        totalCount: 10,
        shareTenthsOfPercent: 100,
        nonCompliancePercent: 5,
      },
    });
  });

  it("refreshes the running figures of the warning that is already open", async () => {
    const atRisk = new DrizzleSecondMonthAtRiskAlerts(db, () => NOW);
    await atRisk.observeAlertCondition(holdingWith());

    await atRisk.observeAlertCondition(
      holdingWith({ exceptionCount: 3, totalCount: 12, shareTenthsOfPercent: 250 }),
    );

    const rows = await db.select().from(alerts);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.detail).toMatchObject({ exceptionCount: 3, totalCount: 12 });
  });

  it("lists no scope of another kind of alert", async () => {
    await new DrizzleSecondMonthAtRiskAlerts(db, () => NOW).observeAlertCondition({
      holds: true,
      alert: {
        kind: "update_required",
        scope: "register-1",
        detail: { deviceId: "device-1", appVersion: "0.9.0" },
      },
    });

    expect(await new DrizzleSecondMonthAtRiskAlerts(db, () => NOW).atRiskAlertScopes()).toEqual([]);
  });

  it("records that the condition cleared when the month is no longer at risk", async () => {
    const atRisk = new DrizzleSecondMonthAtRiskAlerts(db, () => NOW);
    await atRisk.observeAlertCondition(holdingWith());

    await atRisk.observeAlertCondition({
      holds: false,
      kind: "exception_share_second_month_at_risk",
      scope: SCOPE,
    });

    const [row] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.kind, "exception_share_second_month_at_risk"));
    expect(row?.conditionClearedAt).toEqual(NOW);
  });
});
