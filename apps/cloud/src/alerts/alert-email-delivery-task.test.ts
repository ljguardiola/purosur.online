import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alertEmailDeliveries, alerts, users } from "../platform/db/schema.js";
import { scheduleOfCrontabLine } from "../platform/test-support/crontab-schedule.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import {
  ALERT_EMAIL_DELIVERY_TASK_IDENTIFIER,
  alertEmailDeliveryJobs,
} from "./alert-email-delivery-task.js";
import { FakeAlertEmailSender } from "./test-support/fake-alert-email-sender.js";

const NOW = new Date("2026-10-09T15:00:00.000Z");
const MINUTE_MS = 60_000;

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

function jobsSending(sender: FakeAlertEmailSender) {
  return alertEmailDeliveryJobs({
    now: () => NOW,
    sender,
    connections: { withConnection: (work) => work(testDatabase.db) },
  });
}

function runner(sender: FakeAlertEmailSender) {
  const task = jobsSending(sender).taskList[ALERT_EMAIL_DELIVERY_TASK_IDENTIFIER];
  if (!task) {
    throw new Error("test setup: expected the registered alert email delivery task");
  }
  return async () => {
    const { helpers, logs } = buildJobHelpers();
    await task({}, helpers);
    return logs;
  };
}

async function seedDelivery(
  overrides: Partial<typeof alertEmailDeliveries.$inferInsert> & { optedOut?: boolean } = {},
): Promise<string> {
  const { optedOut = false, ...deliveryOverrides } = overrides;
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ada",
      email: "ada@example.com",
      locationId: await seededLocationId(db),
      alertEmailOptedInAt: optedOut ? null : NOW,
    })
    .returning({ id: users.id });
  const [alert] = await db
    .insert(alerts)
    .values({
      kind: "register_silent",
      scope: "register-1",
      level: "warning",
      audience: "all",
      detail: {},
      openedAt: NOW,
    })
    .returning({ id: alerts.id });
  if (!user || !alert) {
    throw new Error("test setup: seeding the user and the alert returned no row");
  }
  const [delivery] = await db
    .insert(alertEmailDeliveries)
    .values({
      alertId: alert.id,
      recipientUserId: user.id,
      stage: "opened",
      level: "warning",
      occurredAt: NOW,
      ...deliveryOverrides,
    })
    .returning({ id: alertEmailDeliveries.id });
  if (!delivery) {
    throw new Error("test setup: seeding the delivery returned no row");
  }
  return delivery.id;
}

async function storedDelivery(deliveryId: string) {
  const [row] = await db
    .select()
    .from(alertEmailDeliveries)
    .where(eq(alertEmailDeliveries.id, deliveryId));
  if (!row) {
    throw new Error("test setup: the delivery is gone");
  }
  return row;
}

describe("alertEmailDeliveryJobs", () => {
  it("registers the alert email delivery task and runs it every minute", () => {
    const jobs = jobsSending(new FakeAlertEmailSender());

    expect(jobs.taskList[ALERT_EMAIL_DELIVERY_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    const schedules = jobs.crontab.map(scheduleOfCrontabLine);
    expect(schedules.map((schedule) => schedule.task)).toEqual([
      ALERT_EMAIL_DELIVERY_TASK_IDENTIFIER,
    ]);
    expect(new Set(schedules[0]?.gapsMs)).toEqual(new Set([MINUTE_MS]));
  });

  it("sends a pending delivery and records it as sent, logging how many went out", async () => {
    const deliveryId = await seedDelivery();
    const sender = new FakeAlertEmailSender({ kind: "sent", providerMessageId: "msg-9" });

    const logs = await runner(sender)();

    expect(sender.sent).toMatchObject([{ deliveryId, to: "ada@example.com", stage: "opened" }]);
    expect(await storedDelivery(deliveryId)).toMatchObject({
      status: "sent",
      attempts: 1,
      sentAt: NOW,
      providerMessageId: "msg-9",
    });
    expect(logs.map((line) => line.message).join("\n")).toContain(
      "1 sent, 0 retrying, 0 failed, 0 skipped",
    );
  });

  it("keeps a failed delivery pending with its error, to try again a minute later", async () => {
    const deliveryId = await seedDelivery();
    const sender = new FakeAlertEmailSender({ kind: "failed", error: "Resend API responded 500" });

    await runner(sender)();

    expect(await storedDelivery(deliveryId)).toMatchObject({
      status: "pending",
      attempts: 1,
      error: "Resend API responded 500",
      nextAttemptAt: new Date(NOW.getTime() + MINUTE_MS),
    });
  });

  it("gives up on a delivery whose last attempt fails, leaving it failed with its error", async () => {
    const deliveryId = await seedDelivery({ attempts: 4 });
    const sender = new FakeAlertEmailSender({ kind: "failed", error: "Resend API responded 500" });

    await runner(sender)();

    expect(await storedDelivery(deliveryId)).toMatchObject({
      status: "failed",
      attempts: 5,
      error: "Resend API responded 500",
    });
  });

  it("leaves a delivery alone until its next attempt is due", async () => {
    const deliveryId = await seedDelivery({
      attempts: 1,
      nextAttemptAt: new Date(NOW.getTime() + MINUTE_MS),
    });
    const sender = new FakeAlertEmailSender();

    await runner(sender)();

    expect(sender.sent).toEqual([]);
    expect(await storedDelivery(deliveryId)).toMatchObject({ status: "pending", attempts: 1 });
  });

  it("skips a delivery whose recipient withdrew the opt-in since, without calling the sender, and logs it", async () => {
    const deliveryId = await seedDelivery({ optedOut: true });
    const sender = new FakeAlertEmailSender();

    const logs = await runner(sender)();

    expect(sender.sent).toEqual([]);
    expect(await storedDelivery(deliveryId)).toMatchObject({ status: "skipped", attempts: 0 });
    expect(logs.map((line) => line.message).join("\n")).toContain(
      "0 sent, 0 retrying, 0 failed, 1 skipped",
    );
  });
});
