import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alertEmailDeliveries, alerts, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleAlertEmailStatusStore } from "./drizzle-alert-email-status-store.js";

const NOON = new Date("2026-10-01T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let recipientId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  recipientId = await insertRecipient();
});

async function insertRecipient(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ada",
      email: "ada@example.com",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: inserting the user returned no row");
  }
  return user.id;
}

async function insertDelivery(
  overrides: Partial<typeof alertEmailDeliveries.$inferInsert> = {},
  scope = "user-1",
): Promise<string> {
  const [alert] = await db
    .insert(alerts)
    .values({
      kind: "backoffice_passkey_changed",
      scope,
      level: "warning",
      audience: "all",
      detail: {},
      openedAt: NOON,
    })
    .returning({ id: alerts.id });
  if (!alert) {
    throw new Error("test setup: inserting the alert returned no row");
  }
  const [delivery] = await db
    .insert(alertEmailDeliveries)
    .values({
      alertId: alert.id,
      recipientUserId: recipientId,
      stage: "opened",
      level: "warning",
      occurredAt: NOON,
      status: "sent",
      providerMessageId: "email-1",
      ...overrides,
    })
    .returning({ id: alertEmailDeliveries.id });
  if (!delivery) {
    throw new Error("test setup: inserting the delivery returned no row");
  }
  return delivery.id;
}

async function stored(deliveryId: string) {
  const [row] = await db
    .select()
    .from(alertEmailDeliveries)
    .where(eq(alertEmailDeliveries.id, deliveryId));
  if (!row) {
    throw new Error("test setup: the delivery is gone");
  }
  return row;
}

describe("DrizzleAlertEmailStatusStore sentAlertEmailOfProviderMessage", () => {
  it("finds the sent delivery of a provider message", async () => {
    const deliveryId = await insertDelivery();

    await expect(
      new DrizzleAlertEmailStatusStore(db).sentAlertEmailOfProviderMessage("email-1"),
    ).resolves.toEqual({ deliveryId });
  });

  it("finds nothing for a provider message no delivery sent", async () => {
    await insertDelivery();

    await expect(
      new DrizzleAlertEmailStatusStore(db).sentAlertEmailOfProviderMessage("someone-elses-email"),
    ).resolves.toBeUndefined();
  });

  it.each(["pending", "failed", "skipped"] as const)(
    "finds nothing for a provider message whose delivery is %s",
    async (status) => {
      await insertDelivery({ status });

      await expect(
        new DrizzleAlertEmailStatusStore(db).sentAlertEmailOfProviderMessage("email-1"),
      ).resolves.toBeUndefined();
    },
  );
});

describe("DrizzleAlertEmailStatusStore isAlertEmailDeliveryPending", () => {
  it("tells a delivery still to be sent is pending", async () => {
    const deliveryId = await insertDelivery({ status: "pending", providerMessageId: null });

    await expect(
      new DrizzleAlertEmailStatusStore(db).isAlertEmailDeliveryPending(deliveryId),
    ).resolves.toBe(true);
  });

  it.each(["sent", "failed", "skipped"] as const)(
    "tells a delivery that is %s is not pending",
    async (status) => {
      const deliveryId = await insertDelivery({ status });

      await expect(
        new DrizzleAlertEmailStatusStore(db).isAlertEmailDeliveryPending(deliveryId),
      ).resolves.toBe(false);
    },
  );

  it("tells a delivery that does not exist is not pending", async () => {
    await insertDelivery({ status: "pending" });

    await expect(
      new DrizzleAlertEmailStatusStore(db).isAlertEmailDeliveryPending(
        "00000000-0000-4000-8000-000000000000",
      ),
    ).resolves.toBe(false);
  });
});

describe("DrizzleAlertEmailStatusStore recordEmailUndelivered", () => {
  it("fails the sent delivery with the reason that the provider could not deliver it", async () => {
    const deliveryId = await insertDelivery();

    await new DrizzleAlertEmailStatusStore(db).recordEmailUndelivered(deliveryId);

    expect(await stored(deliveryId)).toMatchObject({
      status: "failed",
      error: "provider_undelivered",
      providerMessageId: "email-1",
    });
  });

  it("leaves another delivery as it was", async () => {
    const deliveryId = await insertDelivery();
    const otherId = await insertDelivery({ providerMessageId: "email-2" }, "user-2");

    await new DrizzleAlertEmailStatusStore(db).recordEmailUndelivered(deliveryId);

    expect(await stored(otherId)).toMatchObject({ status: "sent", error: null });
  });

  it("leaves a delivery that is not sent as it was", async () => {
    const deliveryId = await insertDelivery({ status: "failed", error: "provider_refused" });

    await new DrizzleAlertEmailStatusStore(db).recordEmailUndelivered(deliveryId);

    expect(await stored(deliveryId)).toMatchObject({ status: "failed", error: "provider_refused" });
  });
});
