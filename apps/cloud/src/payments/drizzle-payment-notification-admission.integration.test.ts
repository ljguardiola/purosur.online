import { PAYMENT_NOTIFICATION_LIMIT } from "@purosur/domain";
import { admitPaymentNotification } from "@purosur/domain/payments/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paymentNotificationAttempts } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzlePaymentNotificationAdmission } from "./drizzle-payment-notification-admission.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("drizzle_payment_notification_admission");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

const NOW = new Date("2026-10-09T12:00:00.000Z");
const TEN_SECONDS_AGO = new Date(NOW.getTime() - 10_000);
const TWO_MINUTES_AGO = new Date(NOW.getTime() - 120_000);

let originCount = 0;

function anOrigin(): string {
  originCount += 1;
  return `203.0.113.${originCount}`;
}

function admit(sourceAddress: string) {
  return admitPaymentNotification(
    { admission: new DrizzlePaymentNotificationAdmission(db), clock: { now: () => NOW } },
    { sourceAddress },
  );
}

async function insertAttempts(sourceAddress: string, attemptedAt: Date, count: number) {
  await db
    .insert(paymentNotificationAttempts)
    .values(Array.from({ length: count }, () => ({ sourceAddress, attemptedAt })));
}

function attemptsOf(sourceAddress: string) {
  return db
    .select({ attemptedAt: paymentNotificationAttempts.attemptedAt })
    .from(paymentNotificationAttempts)
    .where(eq(paymentNotificationAttempts.sourceAddress, sourceAddress));
}

describe("the payment notification admission on a real Postgres", () => {
  it("records an admitted notification with the time it was admitted", async () => {
    const origin = anOrigin();

    expect(await admit(origin)).toEqual({ kind: "admitted" });

    expect(await attemptsOf(origin)).toEqual([{ attemptedAt: NOW }]);
  });

  it("counts only the notifications of the origin asked about and after the moment it is given", async () => {
    const origin = anOrigin();
    await insertAttempts(anOrigin(), TEN_SECONDS_AGO, 3);
    await insertAttempts(origin, TWO_MINUTES_AGO, 2);
    await insertAttempts(origin, TEN_SECONDS_AGO, 4);

    const counted = await new DrizzlePaymentNotificationAdmission(db).transaction((tx) =>
      tx.admittedNotifications(origin, new Date(NOW.getTime() - 60_000)),
    );

    expect(counted).toEqual(Array.from({ length: 4 }, () => TEN_SECONDS_AGO));
  });

  it("forgets the notifications of every origin that left the window, and none still in it", async () => {
    const origin = anOrigin();
    const returning = anOrigin();
    const neverReturning = anOrigin();
    await insertAttempts(returning, TWO_MINUTES_AGO, 2);
    await insertAttempts(neverReturning, TWO_MINUTES_AGO, 1);
    await insertAttempts(neverReturning, TEN_SECONDS_AGO, 1);

    await admit(origin);

    expect(await attemptsOf(returning)).toEqual([]);
    expect(await attemptsOf(neverReturning)).toEqual([{ attemptedAt: TEN_SECONDS_AGO }]);
  });

  it("admits exactly one of two notifications that race for the last place under the limit", async () => {
    const origin = anOrigin();
    await insertAttempts(origin, TEN_SECONDS_AGO, PAYMENT_NOTIFICATION_LIMIT - 1);

    const outcomes = await Promise.all([admit(origin), admit(origin)]);

    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(["admitted", "rate_limited"]);
    expect(await attemptsOf(origin)).toHaveLength(PAYMENT_NOTIFICATION_LIMIT);
  });
});
