import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alertEmailDeliveries, alerts, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleAlertEmailDeliveryStore } from "./drizzle-alert-email-delivery-store.js";

const NOON = new Date("2026-10-01T12:00:00.000Z");

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

async function insertRecipient(email = "ada@example.com"): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName: "Ada", email, locationId: await seededLocationId(db) })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: inserting the user returned no row");
  }
  return user.id;
}

async function insertAlert(overrides: Partial<typeof alerts.$inferInsert> = {}): Promise<string> {
  const [alert] = await db
    .insert(alerts)
    .values({
      kind: "backoffice_passkey_changed",
      scope: "user-1",
      level: "warning",
      audience: "all",
      detail: {},
      openedAt: NOON,
      ...overrides,
    })
    .returning({ id: alerts.id });
  if (!alert) {
    throw new Error("test setup: inserting the alert returned no row");
  }
  return alert.id;
}

async function insertDelivery(
  alertId: string,
  recipientUserId: string,
  overrides: Partial<typeof alertEmailDeliveries.$inferInsert> = {},
): Promise<string> {
  const [delivery] = await db
    .insert(alertEmailDeliveries)
    .values({
      alertId,
      recipientUserId,
      stage: "opened",
      level: "warning",
      occurredAt: NOON,
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

describe("DrizzleAlertEmailDeliveryStore pendingEmailDeliveries", () => {
  it("lists a pending delivery with its recipient, its alert's branch and what the email says", async () => {
    const recipientId = await insertRecipient();
    const alertId = await insertAlert({
      kind: "sales_denied",
      scope: "register-1",
      audience: "local",
      locationId: await seededLocationId(db),
    });
    const deliveryId = await insertDelivery(alertId, recipientId, {
      stage: "escalated",
      level: "critical",
      attempts: 2,
      nextAttemptAt: new Date(NOON.getTime() + 60_000),
    });

    const pending = await new DrizzleAlertEmailDeliveryStore(db).pendingEmailDeliveries();

    expect(pending).toEqual([
      {
        deliveryId,
        recipientUserId: recipientId,
        alertId,
        kind: "sales_denied",
        stage: "escalated",
        level: "critical",
        occurredAt: NOON,
        alertLocationId: await seededLocationId(db),
        attemptsMade: 2,
        nextAttemptAt: new Date(NOON.getTime() + 60_000),
      },
    ]);
  });

  it("names no branch for an alert of no branch", async () => {
    await insertDelivery(await insertAlert(), await insertRecipient());

    const [pending] = await new DrizzleAlertEmailDeliveryStore(db).pendingEmailDeliveries();

    expect(pending?.alertLocationId).toBeNull();
  });

  it("leaves out a delivery already sent or given up on", async () => {
    const recipientId = await insertRecipient();
    const pendingAlert = await insertAlert({ scope: "a" });
    const sentAlert = await insertAlert({ scope: "b" });
    const failedAlert = await insertAlert({ scope: "c" });
    await insertDelivery(pendingAlert, recipientId);
    await insertDelivery(sentAlert, recipientId, { status: "sent" });
    await insertDelivery(failedAlert, recipientId, { status: "failed" });

    const pending = await new DrizzleAlertEmailDeliveryStore(db).pendingEmailDeliveries();

    expect(pending.map((delivery) => delivery.alertId)).toEqual([pendingAlert]);
  });

  it("leaves out a delivery of an alert whose kind the catalog does not list or never goes by email", async () => {
    const recipientId = await insertRecipient();
    const unknown = await insertAlert({ kind: "kind_no_release_knows" });
    const boardOnly = await insertAlert({ kind: "lots_expiring", scope: "branch" });
    const known = await insertAlert({ scope: "other" });
    await insertDelivery(unknown, recipientId);
    await insertDelivery(boardOnly, recipientId);
    await insertDelivery(known, recipientId);

    const pending = await new DrizzleAlertEmailDeliveryStore(db).pendingEmailDeliveries();

    expect(pending.map((delivery) => delivery.alertId)).toEqual([known]);
  });

  it("lists the oldest delivery first", async () => {
    const recipientId = await insertRecipient();
    const first = await insertAlert({ scope: "a" });
    const second = await insertAlert({ scope: "b" });
    await insertDelivery(second, recipientId, { createdAt: new Date(NOON.getTime() + 1_000) });
    await insertDelivery(first, recipientId, { createdAt: NOON });

    const pending = await new DrizzleAlertEmailDeliveryStore(db).pendingEmailDeliveries();

    expect(pending.map((delivery) => delivery.alertId)).toEqual([first, second]);
  });
});

describe("DrizzleAlertEmailDeliveryStore recordEmailAttempt", () => {
  it("records the attempt number and when the next one is due, leaving the delivery pending", async () => {
    const deliveryId = await insertDelivery(await insertAlert(), await insertRecipient());
    const nextAttemptAt = new Date(NOON.getTime() + 60_000);

    await new DrizzleAlertEmailDeliveryStore(db).recordEmailAttempt(deliveryId, {
      attempt: 1,
      nextAttemptAt,
    });

    expect(await stored(deliveryId)).toMatchObject({
      status: "pending",
      attempts: 1,
      nextAttemptAt,
    });
  });
});

describe("DrizzleAlertEmailDeliveryStore recordEmailSent", () => {
  it("marks the delivery sent with when and the provider's message id", async () => {
    const deliveryId = await insertDelivery(await insertAlert(), await insertRecipient(), {
      error: "provider_refused",
    });

    await new DrizzleAlertEmailDeliveryStore(db).recordEmailSent(deliveryId, {
      sentAt: NOON,
      providerMessageId: "msg-1",
    });

    expect(await stored(deliveryId)).toMatchObject({
      status: "sent",
      sentAt: NOON,
      providerMessageId: "msg-1",
      error: null,
    });
  });
});

describe("DrizzleAlertEmailDeliveryStore recordEmailSkipped", () => {
  it("marks only the delivery it names as skipped", async () => {
    const recipientId = await insertRecipient();
    const target = await insertDelivery(await insertAlert({ scope: "a" }), recipientId);
    const other = await insertDelivery(await insertAlert({ scope: "b" }), recipientId);

    await new DrizzleAlertEmailDeliveryStore(db).recordEmailSkipped(target);

    expect(await stored(target)).toMatchObject({ status: "skipped", attempts: 0 });
    expect(await stored(other)).toMatchObject({ status: "pending" });
  });

  it("no longer lists a skipped delivery as pending", async () => {
    const deliveryId = await insertDelivery(await insertAlert(), await insertRecipient());
    const store = new DrizzleAlertEmailDeliveryStore(db);

    await store.recordEmailSkipped(deliveryId);

    expect(await store.pendingEmailDeliveries()).toEqual([]);
  });
});

describe("DrizzleAlertEmailDeliveryStore recordEmailFailure", () => {
  it("keeps the delivery pending with the reason it failed when more attempts remain", async () => {
    const deliveryId = await insertDelivery(await insertAlert(), await insertRecipient());

    await new DrizzleAlertEmailDeliveryStore(db).recordEmailFailure(deliveryId, {
      reason: "provider_refused",
      final: false,
    });

    expect(await stored(deliveryId)).toMatchObject({
      status: "pending",
      error: "provider_refused",
    });
  });

  it("marks the delivery failed with the reason it failed after the last attempt", async () => {
    const deliveryId = await insertDelivery(await insertAlert(), await insertRecipient());

    await new DrizzleAlertEmailDeliveryStore(db).recordEmailFailure(deliveryId, {
      reason: "provider_unreachable",
      final: true,
    });

    expect(await stored(deliveryId)).toMatchObject({
      status: "failed",
      error: "provider_unreachable",
    });
  });

  it("changes only the delivery it names", async () => {
    const recipientId = await insertRecipient();
    const target = await insertDelivery(await insertAlert({ scope: "a" }), recipientId);
    const other = await insertDelivery(await insertAlert({ scope: "b" }), recipientId);

    await new DrizzleAlertEmailDeliveryStore(db).recordEmailFailure(target, {
      reason: "provider_refused",
      final: true,
    });

    expect(await stored(other)).toMatchObject({ status: "pending", error: null });
  });
});

describe("DrizzleAlertEmailDeliveryStore recordEmailGivenUp", () => {
  it("marks only the delivery it names failed, keeping the reason it last failed and its attempts", async () => {
    const recipientId = await insertRecipient();
    const target = await insertDelivery(await insertAlert({ scope: "a" }), recipientId, {
      attempts: 5,
      error: "provider_unreachable",
      nextAttemptAt: NOON,
    });
    const other = await insertDelivery(await insertAlert({ scope: "b" }), recipientId);

    await new DrizzleAlertEmailDeliveryStore(db).recordEmailGivenUp(target);

    expect(await stored(target)).toMatchObject({
      status: "failed",
      attempts: 5,
      error: "provider_unreachable",
    });
    expect(await stored(other)).toMatchObject({ status: "pending" });
  });
});
