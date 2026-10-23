import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, fiscalTasks, locations, registers } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  BACKOFFICE_ORIGIN,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerFiscalTaskClosingRoute } from "./fiscal-task-closing-route.js";
import { registerFiscalTasksListRoute } from "./fiscal-tasks-list-route.js";
import {
  insertDeferredSaleRow,
  insertDeferredSaleTaskRow,
} from "./test-support/deferred-sale-fixtures.js";
import { registerUnbilledDeferredSalesRoute } from "./unbilled-deferred-sales-route.js";

const CREATED_AT = new Date("2026-01-05T09:00:00.000Z");
const NOTE = "regularized with the accountant";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  app = Fastify();
  const options = { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => SESSION_NOON };
  registerFiscalTaskClosingRoute(app, options);
  registerFiscalTasksListRoute(app, options);
  registerUnbilledDeferredSalesRoute(app, options);
});

afterEach(async () => {
  await app.close();
});

function closeTask(
  headers: Record<string, string>,
  taskId: string,
  body: unknown = { note: NOTE },
) {
  return app.inject({
    method: "PUT",
    url: `/fiscal/tasks/${taskId}/closure`,
    headers,
    payload: body as object,
  });
}

async function aClosingSession(permissionKeys = ["close_fiscal_tasks"]) {
  return openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId: await seededLocationId(db),
    permissionKeys,
  });
}

async function insertOpenTask(registerId: string, number = 9): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(fiscalTasks).values({
    id,
    kind: "external_invoicing",
    registerId,
    pointOfSale: 7,
    documentType: "factura_c",
    number,
    reason: { issuedOn: "2026-01-02", total: 12_500, authorizationCode: "75123456789012" },
    state: "open",
    createdAt: CREATED_AT,
  });
  return id;
}

async function anInstallation() {
  return insertEnrolledInstallation(db, { now: SESSION_NOON, registerName: "Caja 1" });
}

async function stateOf(taskId: string) {
  const [row] = await db.select().from(fiscalTasks).where(eq(fiscalTasks.id, taskId));
  return row;
}

describe("PUT /fiscal/tasks/:id/closure", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await closeTask({ origin: BACKOFFICE_ORIGIN }, crypto.randomUUID());

    expect(response.statusCode).toBe(401);
  });

  it("rejects a user without the capability with 403 and leaves the task open", async () => {
    const { registerId } = await anInstallation();
    const taskId = await insertOpenTask(registerId);
    const session = await aClosingSession(["view_fiscal_documents"]);

    const response = await closeTask(session.headers, taskId);

    expect(response.statusCode).toBe(403);
    expect(await stateOf(taskId)).toMatchObject({ state: "open", closedBy: null });
  });

  it.each([
    ["no note", {}],
    ["a blank note", { note: "   " }],
  ])("rejects %s with 400 and leaves the task open", async (_name, body) => {
    const { registerId } = await anInstallation();
    const taskId = await insertOpenTask(registerId);
    const session = await aClosingSession();

    const response = await closeTask(session.headers, taskId, body);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    expect(await stateOf(taskId)).toMatchObject({ state: "open" });
  });

  it("answers 404 for a task of another branch and leaves it open", async () => {
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    const [otherRegister] = await db
      .insert(registers)
      .values({ locationId: otherLocation?.id ?? "", name: "Caja 9" })
      .returning({ id: registers.id });
    const taskId = await insertOpenTask(otherRegister?.id ?? "");
    const session = await aClosingSession();

    const response = await closeTask(session.headers, taskId);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
    expect(await stateOf(taskId)).toMatchObject({ state: "open" });
  });

  it("answers 404 for a task that does not exist", async () => {
    const session = await aClosingSession();

    const response = await closeTask(session.headers, crypto.randomUUID());

    expect(response.statusCode).toBe(404);
  });

  it("closes the task with 204, takes it off the open list and audits it", async () => {
    const installation = await anInstallation();
    const taskId = await insertOpenTask(installation.registerId);
    const session = await aClosingSession(["close_fiscal_tasks", "view_fiscal_documents"]);

    const response = await closeTask(session.headers, taskId);

    expect(response.statusCode).toBe(204);
    expect(await stateOf(taskId)).toMatchObject({
      state: "closed",
      closedAt: SESSION_NOON,
      closedBy: session.userId,
      closingNote: NOTE,
    });
    const list = await app.inject({
      method: "GET",
      url: "/fiscal/tasks",
      headers: session.headers,
    });
    expect(list.json()).toEqual({ tasks: [] });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, taskId));
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({
      entity: "fiscal_task",
      actorId: session.userId,
      newValue: { state: "closed", note: NOTE },
    });
  });

  it("answers 409 when the task was already closed and changes nothing", async () => {
    const { registerId } = await anInstallation();
    const taskId = await insertOpenTask(registerId);
    const session = await aClosingSession();
    await closeTask(session.headers, taskId);

    const response = await closeTask(session.headers, taskId, { note: "second thoughts" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: "already_closed",
      message: "this fiscal task was already closed",
    });
    expect(await stateOf(taskId)).toMatchObject({ closingNote: NOTE });
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, taskId))).toHaveLength(1);
  });

  it("stops counting an expired deferred sale once its task is closed", async () => {
    const installation = await anInstallation();
    const locationId = await seededLocationId(db);
    const deferredSale = await insertDeferredSaleRow(db, {
      registerId: installation.registerId,
      locationId,
      state: "expired",
      occurredAt: new Date("2025-12-30T15:00:00.000Z"),
      expiredAt: CREATED_AT,
    });
    const taskId = await insertDeferredSaleTaskRow(db, {
      registerId: installation.registerId,
      deferredSaleId: deferredSale.id,
    });
    const session = await aClosingSession(["close_fiscal_tasks", "view_fiscal_documents"]);
    const counter = () =>
      app.inject({
        method: "GET",
        url: "/fiscal/unbilled-deferred-sales",
        headers: session.headers,
      });
    expect((await counter()).json()).toMatchObject({ count: 1 });

    await closeTask(session.headers, taskId);

    expect((await counter()).json()).toEqual({ count: 0, oldest: null });
  });
});
