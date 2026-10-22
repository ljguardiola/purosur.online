import type { AlertConditionObservation } from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleDeferredSaleDueAlerts } from "./drizzle-deferred-sale-due-alerts.js";

const NOW = new Date("2026-10-04T15:00:00.000Z");

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

const SCOPE = "0199b7a0-0000-7000-8000-0000000000d1";

async function dueObservation(): Promise<AlertConditionObservation> {
  const { registerId, locationId } = await insertEnrolledInstallation(db, { now: NOW });
  return {
    holds: true,
    level: "warning",
    alert: {
      kind: "deferred_sale_due",
      scope: SCOPE,
      locationId,
      detail: {
        registerId,
        saleId: "0199b7a0-0000-7000-8000-0000000000d2",
        saleOccurredAt: "2026-10-01T15:00:00.000Z",
        total: 4800,
        shortCode: "7KQ4M2P9",
        expiresOn: "2026-10-31",
        escalatesAt: "2026-10-05T03:00:00.000Z",
      },
    },
  };
}

describe("DrizzleDeferredSaleDueAlerts", () => {
  it("opens the alert of a due deferred sale and lists its scope while it is open", async () => {
    const alerts_ = new DrizzleDeferredSaleDueAlerts(db, () => NOW);

    await alerts_.observeAlertCondition(await dueObservation());

    expect(await alerts_.dueAlertScopes()).toEqual([SCOPE]);
    const [row] = await db.select().from(alerts);
    expect(row).toMatchObject({ kind: "deferred_sale_due", level: "warning" });
  });

  it("resolves the alert of a deferred sale no longer due and stops listing its scope", async () => {
    const alerts_ = new DrizzleDeferredSaleDueAlerts(db, () => NOW);
    await alerts_.observeAlertCondition(await dueObservation());

    await alerts_.observeAlertCondition({ holds: false, kind: "deferred_sale_due", scope: SCOPE });

    expect(await alerts_.dueAlertScopes()).toEqual([]);
    const [row] = await db.select().from(alerts).where(eq(alerts.kind, "deferred_sale_due"));
    expect(row?.resolvedAt).toBeInstanceOf(Date);
  });
});
