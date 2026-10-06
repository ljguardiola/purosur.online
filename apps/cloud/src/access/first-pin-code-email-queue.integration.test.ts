import { randomUUID } from "node:crypto";
import { emitFirstPinCode } from "@purosur/domain/access/use-cases";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { registers, userPinCodes, users } from "../platform/db/schema.js";
import { hashSecretCode } from "../platform/secret-code.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleFirstPinCodeStore } from "./drizzle-first-pin-code-store.js";
import {
  type EnqueueFirstPinCodeEmail,
  enqueueFirstPinCodeEmailJob,
} from "./graphile-first-pin-code-email-queue.js";
import { generatePinCode } from "./pin-code-generator.js";
import type { AccessEmailSender, SendFirstPinCodeInput } from "./recovery-email-sender.js";
import { FIRST_PIN_CODE_EMAIL_TASK_IDENTIFIER, startRecoveryWorker } from "./recovery-worker.js";

// Only a real Postgres has graphile-worker's job table and a transaction the enqueue can join.
const WAIT_OPTIONS = { timeout: 20_000, interval: 100 };

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("first_pin_code_email_queue");
  sql = postgres(integrationDb.databaseUrl, { max: 5 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

interface Person {
  registerId: string;
  userId: string;
  email: string;
}

async function seedPersonWithoutPin(): Promise<Person> {
  const locationId = await seededLocationId(db);
  const email = `grace-${randomUUID()}@example.com`;
  const [register] = await db
    .insert(registers)
    .values({ locationId, name: `Caja ${randomUUID()}` })
    .returning({ id: registers.id });
  const [user] = await db
    .insert(users)
    .values({ firstName: "Grace Hopper", email, locationId })
    .returning({ id: users.id });
  if (!register || !user) {
    throw new Error("test setup: seeding the register or the user returned no row");
  }
  return { registerId: register.id, userId: user.id, email };
}

function emit(person: Person, enqueueEmail?: EnqueueFirstPinCodeEmail) {
  return emitFirstPinCode(
    {
      store: new DrizzleFirstPinCodeStore(db, enqueueEmail),
      clock: { now: () => new Date() },
      codes: { generate: generatePinCode },
    },
    { registerId: person.registerId, userId: person.userId },
  );
}

async function queuedJobsFor(email: string) {
  return sql<{ taskIdentifier: string; payload: { email: string; code: string } }[]>`
    select task.identifier as "taskIdentifier", job.payload
    from graphile_worker._private_jobs job
    join graphile_worker._private_tasks task on task.id = job.task_id
    where job.payload->>'email' = ${email}
  `;
}

describe("the first PIN code email queued by an emission on a real Postgres", () => {
  it("has a job for the email once the emission committed, carrying the code that was stored", async () => {
    const person = await seedPersonWithoutPin();

    const outcome = await emit(person);

    expect(outcome.kind).toBe("emitted");
    const [job] = await queuedJobsFor(person.email);
    expect(await queuedJobsFor(person.email)).toHaveLength(1);
    expect(job?.taskIdentifier).toBe(FIRST_PIN_CODE_EMAIL_TASK_IDENTIFIER);
    const [stored] = await db
      .select()
      .from(userPinCodes)
      .where(eq(userPinCodes.userId, person.userId));
    expect(stored?.codeHash).toBe(hashSecretCode(job?.payload.code ?? ""));
    expect(Object.keys(job?.payload ?? {}).sort()).toEqual(["code", "email"]);
  });

  it("leaves no job when the emission rolls back after queueing the email", async () => {
    const person = await seedPersonWithoutPin();
    const failAfterQueueing: EnqueueFirstPinCodeEmail = async (transaction, email) => {
      await enqueueFirstPinCodeEmailJob(transaction, email);
      throw new Error("the emission failed after queueing");
    };

    await expect(emit(person, failAfterQueueing)).rejects.toThrow("after queueing");

    expect(await queuedJobsFor(person.email)).toHaveLength(0);
    expect(
      await db.select().from(userPinCodes).where(eq(userPinCodes.userId, person.userId)),
    ).toEqual([]);
  });

  it("is delivered by the real worker, which retries a send that fails once", async () => {
    const person = await seedPersonWithoutPin();
    const sent: SendFirstPinCodeInput[] = [];
    const failedOnce = new Set<string>();
    const emailSender: AccessEmailSender = {
      async sendRecoveryLink() {},
      async sendFirstPinCode(input) {
        if (!failedOnce.has(input.to)) {
          failedOnce.add(input.to);
          throw new Error("fake sender: simulated delivery failure");
        }
        sent.push(input);
      },
    };
    const worker = await startRecoveryWorker({
      now: () => new Date(),
      databaseUrl: integrationDb.databaseUrl,
      backofficeOrigin: "https://staging.purosur.online",
      emailSender,
    });

    try {
      await emit(person);

      await vi.waitFor(() => {
        expect(sent.filter((input) => input.to === person.email)).toHaveLength(1);
      }, WAIT_OPTIONS);

      const [stored] = await db
        .select()
        .from(userPinCodes)
        .where(eq(userPinCodes.userId, person.userId));
      const [delivered] = sent.filter((input) => input.to === person.email);
      expect(stored?.codeHash).toBe(hashSecretCode(delivered?.code ?? ""));
      expect(failedOnce.has(person.email)).toBe(true);
    } finally {
      await worker.stop();
    }
  });

  it("emails only the newer code when a second emission supersedes the first before the worker runs", async () => {
    const person = await seedPersonWithoutPin();
    const sent: SendFirstPinCodeInput[] = [];
    const emailSender: AccessEmailSender = {
      async sendRecoveryLink() {},
      async sendFirstPinCode(input) {
        sent.push(input);
      },
    };
    await emit(person);
    await emit(person);
    expect(await queuedJobsFor(person.email)).toHaveLength(2);
    const worker = await startRecoveryWorker({
      now: () => new Date(),
      databaseUrl: integrationDb.databaseUrl,
      backofficeOrigin: "https://staging.purosur.online",
      emailSender,
    });

    try {
      await vi.waitFor(async () => {
        expect(await queuedJobsFor(person.email)).toHaveLength(0);
      }, WAIT_OPTIONS);

      const delivered = sent.filter((input) => input.to === person.email);
      expect(delivered).toHaveLength(1);
      const [live] = await db
        .select()
        .from(userPinCodes)
        .where(and(eq(userPinCodes.userId, person.userId), isNull(userPinCodes.supersededAt)));
      expect(live?.codeHash).toBe(hashSecretCode(delivered[0]?.code ?? ""));
    } finally {
      await worker.stop();
    }
  });
});
