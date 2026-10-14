import type { NewAlert } from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";
import { DrizzleExpiringLotAlerts } from "./drizzle-expiring-lot-alerts.js";

const NOW = new Date("2026-10-12T15:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let locationId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  locationId = await seededLocationId(db);
});

function expiringLotsAlert(overrides: Partial<NewAlert> = {}): NewAlert {
  return {
    kind: "lots_expiring",
    scope: locationId,
    level: "informational",
    audience: "local",
    locationId,
    detail: { lotCount: 2, windowDays: 30 },
    openedAt: NOW,
    escalateAt: null,
    deduplicates: true,
    ...overrides,
  };
}

function expiringLotAlerts() {
  return new DrizzleExpiringLotAlerts(db, () => NOW);
}

describe("DrizzleExpiringLotAlerts openAlertScopes", () => {
  it("lists the scopes of the open lots-expiring alerts only", async () => {
    const store = new DrizzleAlertStore(db, () => NOW);
    await store.transaction((tx) => tx.insertAlert(expiringLotsAlert()));
    await store.transaction((tx) =>
      tx.insertAlert(
        expiringLotsAlert({
          kind: "register_silent",
          scope: "register-3",
          detail: { deviceId: "device-3", lastAcceptedPushAt: NOW.toISOString() },
        }),
      ),
    );

    await expect(expiringLotAlerts().openAlertScopes()).resolves.toEqual([locationId]);
  });

  it("leaves out a lots-expiring alert already resolved", async () => {
    const id = await new DrizzleAlertStore(db, () => NOW).transaction((tx) =>
      tx.insertAlert(expiringLotsAlert()),
    );
    await db.update(alerts).set({ resolvedAt: NOW }).where(eq(alerts.id, id));

    await expect(expiringLotAlerts().openAlertScopes()).resolves.toEqual([]);
  });
});

describe("DrizzleExpiringLotAlerts observeAlertCondition", () => {
  it("opens an informational alert local to the branch, by the clock it is handed", async () => {
    await expiringLotAlerts().observeAlertCondition({
      holds: true,
      level: "informational",
      alert: {
        kind: "lots_expiring",
        scope: locationId,
        locationId,
        detail: { lotCount: 3, windowDays: 30 },
      },
    });

    await expect(
      db
        .select({
          scope: alerts.scope,
          level: alerts.level,
          audience: alerts.audience,
          locationId: alerts.locationId,
          detail: alerts.detail,
          openedAt: alerts.openedAt,
        })
        .from(alerts),
    ).resolves.toEqual([
      {
        scope: locationId,
        level: "informational",
        audience: "local",
        locationId,
        detail: { lotCount: 3, windowDays: 30 },
        openedAt: NOW,
      },
    ]);
  });

  it("marks the open alert of a branch with no lot left nearing expiry as cleared", async () => {
    await new DrizzleAlertStore(db, () => NOW).transaction((tx) =>
      tx.insertAlert(expiringLotsAlert()),
    );

    await expiringLotAlerts().observeAlertCondition({
      holds: false,
      kind: "lots_expiring",
      scope: locationId,
    });

    await expect(
      db.select({ conditionClearedAt: alerts.conditionClearedAt }).from(alerts),
    ).resolves.toEqual([{ conditionClearedAt: NOW }]);
  });
});
