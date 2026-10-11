import { configureRegisterPointOfSale } from "@purosur/domain/fiscal/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fiscalAddresses, registers, users } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRegisterPointOfSaleStore } from "./drizzle-register-point-of-sale-store.js";
import { enqueueTaxAuthorityCountJob } from "./graphile-tax-authority-count-queue.js";
import { OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER } from "./offline-authorization-code-task.js";
import { resumeWorkWaitingOnWsaaToken } from "./resume-work-waiting-on-wsaa-token.js";
import { TAX_AUTHORITY_COUNT_TASK_IDENTIFIER } from "./tax-authority-count-task.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const POINT_OF_SALE = 61;

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeEach(async () => {
  integrationDb = await createIntegrationDatabase("resume_work_waiting_on_wsaa_token");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterEach(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function claimPointOfSale() {
  const locationId = await seededLocationId(db);
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email: "ada@example.com", locationId })
    .returning({ id: users.id });
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name: "Deposito Central", streetAddress: "Calle Ficticia 123, CABA" })
    .returning({ id: fiscalAddresses.id });
  const [register] = await db
    .insert(registers)
    .values({ locationId, name: "Caja 1" })
    .returning({ id: registers.id });
  if (!actor || !fiscalAddress || !register) {
    throw new Error("test setup: seeding returned no row");
  }
  await configureRegisterPointOfSale(new DrizzleRegisterPointOfSaleStore(db, () => NOW), {
    locationId,
    registerId: register.id,
    pointOfSaleNumber: POINT_OF_SALE,
    fiscalAddressId: fiscalAddress.id,
    version: 0,
    actorId: actor.id,
  });
}

async function failOnNoToken(taskIdentifier: string) {
  await sql`
    update graphile_worker._private_jobs set attempts = 4, run_at = now() + interval '3 hours',
      last_error = 'no_token'
    where task_id = (select id from graphile_worker._private_tasks where identifier = ${taskIdentifier})`;
}

async function jobsOf(taskIdentifier: string) {
  return sql<{ attempts: number; runnable: boolean }[]>`
    select attempts, run_at <= now() as runnable from graphile_worker.jobs
    where task_identifier = ${taskIdentifier}`;
}

describe("resuming the work that waits on a WSAA token, on a real Postgres", () => {
  it("makes a tax authority count that kept failing for lack of a token runnable again, with its attempts reset", async () => {
    await claimPointOfSale();
    await enqueueTaxAuthorityCountJob(db, POINT_OF_SALE);
    await failOnNoToken(TAX_AUTHORITY_COUNT_TASK_IDENTIFIER);
    expect(await jobsOf(TAX_AUTHORITY_COUNT_TASK_IDENTIFIER)).toEqual([
      { attempts: 4, runnable: false },
    ]);

    await db.transaction((transaction) => resumeWorkWaitingOnWsaaToken(transaction));

    expect(await jobsOf(TAX_AUTHORITY_COUNT_TASK_IDENTIFIER)).toEqual([
      { attempts: 0, runnable: true },
    ]);
  });

  it("adds the acquisition of the offline authorization code when none is pending", async () => {
    await db.transaction((transaction) => resumeWorkWaitingOnWsaaToken(transaction));

    expect(await jobsOf(OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER)).toEqual([
      { attempts: 0, runnable: true },
    ]);
  });

  it("makes an acquisition of the offline authorization code that kept failing runnable again, without duplicating it", async () => {
    await db.transaction((transaction) => resumeWorkWaitingOnWsaaToken(transaction));
    await failOnNoToken(OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER);

    await db.transaction((transaction) => resumeWorkWaitingOnWsaaToken(transaction));

    expect(await jobsOf(OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER)).toEqual([
      { attempts: 0, runnable: true },
    ]);
  });

  it("leaves every job as it was when the transaction that resumes the work rolls back", async () => {
    await claimPointOfSale();
    await enqueueTaxAuthorityCountJob(db, POINT_OF_SALE);
    await failOnNoToken(TAX_AUTHORITY_COUNT_TASK_IDENTIFIER);

    await expect(
      db.transaction(async (transaction) => {
        await resumeWorkWaitingOnWsaaToken(transaction);
        throw new Error("the answer failed after resuming");
      }),
    ).rejects.toThrow("the answer failed");

    expect(await jobsOf(TAX_AUTHORITY_COUNT_TASK_IDENTIFIER)).toEqual([
      { attempts: 4, runnable: false },
    ]);
    expect(await jobsOf(OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER)).toEqual([]);
  });
});
