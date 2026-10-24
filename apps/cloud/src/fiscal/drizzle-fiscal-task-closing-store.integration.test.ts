import { closeFiscalTask } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, fiscalTasks, locations, registers, users } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleFiscalTaskClosingStore } from "./drizzle-fiscal-task-closing-store.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");
const CREATED_AT = new Date("2026-01-05T09:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let locationId: string;
let registerId: string;
let seeded = 0;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("fiscal_task_closing_store");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
  locationId = await seededLocationId(db);
  registerId = await insertRegister(locationId, "Caja 1");
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function closingPorts(now: () => Date) {
  return { store: new DrizzleFiscalTaskClosingStore(db), clock: { now } };
}

async function insertRegister(onLocationId: string, name: string): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId: onLocationId, name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: inserting the register returned no row");
  }
  return register.id;
}

async function insertCloser(name: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName: name, email: `${name.toLowerCase()}@example.com`, locationId })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: inserting the user returned no row");
  }
  return user.id;
}

async function insertOpenTask(onRegisterId = registerId): Promise<string> {
  seeded += 1;
  const id = crypto.randomUUID();
  await db.insert(fiscalTasks).values({
    id,
    kind: "external_invoicing",
    registerId: onRegisterId,
    pointOfSale: 7,
    documentType: "factura_c",
    number: seeded,
    reason: {},
    state: "open",
    createdAt: CREATED_AT,
  });
  return id;
}

describe("closing a fiscal task on a real Postgres", () => {
  it("records who closed the task, when and why, and audits it", async () => {
    const taskId = await insertOpenTask();
    const closedBy = await insertCloser("Grace");

    const outcome = await closeFiscalTask(
      closingPorts(() => NOON),
      { taskId, locationId, closedBy, note: "regularized with the accountant" },
    );

    expect(outcome).toEqual({ kind: "closed", closedAt: NOON });
    const [row] = await db.select().from(fiscalTasks).where(eq(fiscalTasks.id, taskId));
    expect(row).toMatchObject({
      state: "closed",
      closedAt: NOON,
      closedBy,
      closingNote: "regularized with the accountant",
    });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, taskId));
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({
      entity: "fiscal_task",
      actorId: closedBy,
      at: NOON,
      previousValue: { state: "open" },
      newValue: { state: "closed", note: "regularized with the accountant" },
    });
  });

  it("does not see a task of another branch", async () => {
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: inserting the other location returned no row");
    }
    const taskId = await insertOpenTask(await insertRegister(otherLocation.id, "Caja 9"));
    const closedBy = await insertCloser("Ada");

    const outcome = await closeFiscalTask(
      closingPorts(() => NOON),
      { taskId, locationId, closedBy, note: "regularized" },
    );

    expect(outcome).toEqual({ kind: "not_found" });
    const [row] = await db.select().from(fiscalTasks).where(eq(fiscalTasks.id, taskId));
    expect(row).toMatchObject({ state: "open", closedAt: null, closedBy: null });
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, taskId))).toEqual([]);
  });

  it("closes it for the first of two closings at once, and tells the second it was already closed", async () => {
    const taskId = await insertOpenTask();
    const firstCloser = await insertCloser("Hedy");
    const secondCloser = await insertCloser("Edith");

    const [firstOutcome, secondOutcome] = await runQueuedBehindHeldLock(
      sql,
      (holder) => holder`select id from fiscal_tasks where id = ${taskId} for update`,
      () =>
        closeFiscalTask(
          closingPorts(() => NOON),
          { taskId, locationId, closedBy: firstCloser, note: "first" },
        ),
      () =>
        closeFiscalTask(
          closingPorts(() => new Date(NOON.getTime() + 1_000)),
          { taskId, locationId, closedBy: secondCloser, note: "second" },
        ),
    );

    expect(firstOutcome.kind).toBe("closed");
    expect(secondOutcome).toEqual({ kind: "already_closed" });
    const [row] = await db.select().from(fiscalTasks).where(eq(fiscalTasks.id, taskId));
    expect(row).toMatchObject({ closedAt: NOON, closedBy: firstCloser, closingNote: "first" });
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, taskId))).toHaveLength(1);
  }, 30_000);
});
