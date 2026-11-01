import type { OpenAlertInput } from "@purosur/domain";
import type { NewAlert } from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";
import { DrizzleExceptionShareBreachAlerts } from "./drizzle-exception-share-breach-alerts.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const FISCAL_ADDRESS_ID = "0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f";
const SCOPE = `${FISCAL_ADDRESS_ID}:2026-09`;

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

function breachInput(nonCompliantMonths: string[] = ["2026-09"]): OpenAlertInput {
  return {
    kind: "exception_share_breach",
    scope: SCOPE,
    detail: {
      fiscalAddressId: FISCAL_ADDRESS_ID,
      fiscalAddressName: "Depósito Central",
      month: "2026-09",
      exceptionCount: 1,
      totalCount: 10,
      nonCompliantMonths,
    },
  };
}

function breachAlert(overrides: Partial<NewAlert> = {}): NewAlert {
  return {
    ...breachInput(),
    level: "critical",
    audience: "all",
    locationId: null,
    openedAt: NOW,
    escalateAt: null,
    deduplicates: true,
    ...overrides,
  };
}

function insert(alert: NewAlert): Promise<string> {
  return new DrizzleAlertStore(db, () => NOW).transaction((tx) => tx.insertAlert(alert));
}

function breachAlerts() {
  return new DrizzleExceptionShareBreachAlerts(db, () => NOW);
}

describe("DrizzleExceptionShareBreachAlerts hasOpenedBreachAlert", () => {
  it("is false while no breach alert was opened for the scope", async () => {
    await insert(breachAlert({ scope: `${FISCAL_ADDRESS_ID}:2026-08` }));
    await insert(
      breachAlert({
        kind: "update_required",
        detail: { deviceId: "device-1", appVersion: "0.9.0" },
      }),
    );

    await expect(breachAlerts().hasOpenedBreachAlert(SCOPE)).resolves.toBe(false);
  });

  it("is true while the breach alert of the scope is open", async () => {
    await insert(breachAlert());

    await expect(breachAlerts().hasOpenedBreachAlert(SCOPE)).resolves.toBe(true);
  });

  it("is still true after a person closed the breach alert", async () => {
    const id = await insert(breachAlert());
    await db.update(alerts).set({ resolvedAt: NOW }).where(eq(alerts.id, id));

    await expect(breachAlerts().hasOpenedBreachAlert(SCOPE)).resolves.toBe(true);
  });
});

describe("DrizzleExceptionShareBreachAlerts openBreachAlert", () => {
  it("opens a critical alert for everyone, with the scope and the detail it is handed", async () => {
    await breachAlerts().openBreachAlert(breachInput(["2026-03", "2026-09"]));

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
        kind: "exception_share_breach",
        scope: SCOPE,
        level: "critical",
        audience: "all",
        detail: {
          fiscalAddressId: FISCAL_ADDRESS_ID,
          fiscalAddressName: "Depósito Central",
          month: "2026-09",
          exceptionCount: 1,
          totalCount: 10,
          nonCompliantMonths: ["2026-03", "2026-09"],
        },
        openedAt: NOW,
        resolvedAt: null,
      },
    ]);
  });
});
