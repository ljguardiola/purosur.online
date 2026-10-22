import type { NewAlert } from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";
import { DrizzleRejectedFortnightDocumentAlerts } from "./drizzle-rejected-fortnight-document-alerts.js";

const NOW = new Date("2026-10-17T15:00:00.000Z");
const SCOPE = "8:2026-10-01:factura_c";
const DETAIL = {
  pointOfSaleNumber: 8,
  registerId: "register-1",
  fortnightStart: "2026-10-01",
  fortnightEnd: "2026-10-15",
  documentType: "factura_c",
  rejectedNumber: 4,
} as const;

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

function rejectedDocumentAlert(overrides: Partial<NewAlert> = {}): NewAlert {
  return {
    kind: "fortnight_report_document_rejected",
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

function rejectedDocumentAlerts() {
  return new DrizzleRejectedFortnightDocumentAlerts(db, () => NOW);
}

describe("DrizzleRejectedFortnightDocumentAlerts rejectedDocumentAlertScopes", () => {
  it("lists the scopes of the open rejected document alerts only", async () => {
    await insert(rejectedDocumentAlert());
    await insert(
      rejectedDocumentAlert({
        kind: "fortnight_report_owed_elsewhere",
        scope: "9:2026-10-01",
        detail: { pointOfSaleNumber: 9, fortnightStart: "2026-10-01", fortnightEnd: "2026-10-15" },
      }),
    );

    await expect(rejectedDocumentAlerts().rejectedDocumentAlertScopes()).resolves.toEqual([SCOPE]);
  });

  it("leaves out an alert already resolved", async () => {
    const id = await insert(rejectedDocumentAlert());
    await db.update(alerts).set({ resolvedAt: NOW }).where(eq(alerts.id, id));

    await expect(rejectedDocumentAlerts().rejectedDocumentAlertScopes()).resolves.toEqual([]);
  });
});

describe("DrizzleRejectedFortnightDocumentAlerts observeAlertCondition", () => {
  it("opens one critical alert for everyone naming the rejected document, by the clock it is handed", async () => {
    const observation = {
      holds: true,
      alert: { kind: "fortnight_report_document_rejected", scope: SCOPE, detail: DETAIL },
    } as const;

    await rejectedDocumentAlerts().observeAlertCondition(observation);
    await rejectedDocumentAlerts().observeAlertCondition(observation);

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
        kind: "fortnight_report_document_rejected",
        scope: SCOPE,
        level: "critical",
        audience: "all",
        detail: DETAIL,
        openedAt: NOW,
      },
    ]);
  });

  it("marks the open alert of a document no longer awaiting its remedy as cleared", async () => {
    await insert(rejectedDocumentAlert());

    await rejectedDocumentAlerts().observeAlertCondition({
      holds: false,
      kind: "fortnight_report_document_rejected",
      scope: SCOPE,
    });

    await expect(
      db.select({ conditionClearedAt: alerts.conditionClearedAt }).from(alerts),
    ).resolves.toEqual([{ conditionClearedAt: NOW }]);
  });
});
