import type { NewAlert } from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DrizzleAlertStore } from "../alerts/drizzle-alert-store.js";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleMissingOfflineAuthorizationCodeAlerts } from "./drizzle-missing-offline-authorization-code-alerts.js";

const NOW = new Date("2026-10-12T15:00:00.000Z");

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

function missingCodeAlert(overrides: Partial<NewAlert> = {}): NewAlert {
  return {
    kind: "offline_authorization_code_missing",
    scope: "register-1:2026-10-16",
    level: "informational",
    audience: "all",
    locationId: null,
    detail: { deviceId: "device-1", fortnightStart: "2026-10-16", fortnightEnd: "2026-10-31" },
    openedAt: NOW,
    escalateAt: null,
    deduplicates: true,
    ...overrides,
  };
}

function missingCodeAlerts() {
  return new DrizzleMissingOfflineAuthorizationCodeAlerts(db, () => NOW);
}

describe("DrizzleMissingOfflineAuthorizationCodeAlerts openAlertScopes", () => {
  it("lists the scopes of the open alerts of a missing offline authorization code only", async () => {
    const store = new DrizzleAlertStore(db, () => NOW);
    await store.transaction((tx) => tx.insertAlert(missingCodeAlert()));
    const resolved = await store.transaction((tx) =>
      tx.insertAlert(missingCodeAlert({ scope: "register-2:2026-10-16" })),
    );
    await db.update(alerts).set({ resolvedAt: NOW }).where(eq(alerts.id, resolved));
    await store.transaction((tx) =>
      tx.insertAlert(
        missingCodeAlert({
          kind: "register_silent",
          scope: "register-3",
          detail: { deviceId: "device-3", lastAcceptedPushAt: NOW.toISOString() },
        }),
      ),
    );

    await expect(missingCodeAlerts().openAlertScopes()).resolves.toEqual(["register-1:2026-10-16"]);
  });
});

describe("DrizzleMissingOfflineAuthorizationCodeAlerts observeAlertCondition", () => {
  it("opens the alert of a missing code at the level observed, by the clock it is handed", async () => {
    await missingCodeAlerts().observeAlertCondition({
      holds: true,
      level: "warning",
      alert: {
        kind: "offline_authorization_code_missing",
        scope: "register-1:2026-10-16",
        detail: { deviceId: "device-1", fortnightStart: "2026-10-16", fortnightEnd: "2026-10-31" },
      },
    });

    await expect(
      db
        .select({ scope: alerts.scope, level: alerts.level, openedAt: alerts.openedAt })
        .from(alerts),
    ).resolves.toEqual([{ scope: "register-1:2026-10-16", level: "warning", openedAt: NOW }]);
  });

  it("marks the open alert of a code now held as cleared", async () => {
    await new DrizzleAlertStore(db, () => NOW).transaction((tx) =>
      tx.insertAlert(missingCodeAlert()),
    );

    await missingCodeAlerts().observeAlertCondition({
      holds: false,
      kind: "offline_authorization_code_missing",
      scope: "register-1:2026-10-16",
    });

    await expect(
      db.select({ conditionClearedAt: alerts.conditionClearedAt }).from(alerts),
    ).resolves.toEqual([{ conditionClearedAt: NOW }]);
  });
});
