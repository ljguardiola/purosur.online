import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { suppliers } from "../platform/db/schema.js";
import { BACKOFFICE_ORIGIN, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerSuppliersRoutes } from "./suppliers-routes.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";

const NOW = new Date("2026-09-16T15:00:00.000Z");
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

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
  registerSuppliersRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

async function manager() {
  return signedInWith(db, ["manage_suppliers"], NOW);
}

async function storedSupplier(
  actorId: string,
  fields: Partial<typeof suppliers.$inferInsert> = {},
): Promise<{ id: string; version: number }> {
  const [row] = await db
    .insert(suppliers)
    .values({ name: "Distribuidora Sur", actorId, ...fields })
    .returning({ id: suppliers.id, version: suppliers.version });
  if (!row) {
    throw new Error("test setup: seeding the supplier returned no row");
  }
  return row;
}

describe("GET /suppliers", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/suppliers",
      headers: { origin: BACKOFFICE_ORIGIN },
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 to a user without the suppliers permission", async () => {
    const { headers } = await signedInWith(db, ["sell_and_charge"], NOW);

    const response = await app.inject({ method: "GET", url: "/suppliers", headers });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists every supplier by name, deactivated ones included", async () => {
    const { headers, userId } = await manager();
    await storedSupplier(userId, { name: "Zeta", active: false });
    await storedSupplier(userId, { name: "Alfa", cuit: FICTIONAL_CUIT, contact: "Marta" });

    const response = await app.inject({ method: "GET", url: "/suppliers", headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: expect.any(String),
        name: "Alfa",
        cuit: FICTIONAL_CUIT,
        contact: "Marta",
        note: null,
        active: true,
        version: 1,
      },
      {
        id: expect.any(String),
        name: "Zeta",
        cuit: null,
        contact: null,
        note: null,
        active: false,
        version: 1,
      },
    ]);
  });
});

describe("POST /suppliers", () => {
  it("returns 403 to a user without the suppliers permission, creating nothing", async () => {
    const { headers } = await signedInWith(db, ["sell_and_charge"], NOW);

    const response = await app.inject({
      method: "POST",
      url: "/suppliers",
      headers,
      payload: { name: "Distribuidora Sur" },
    });

    expect(response.statusCode).toBe(403);
    expect(await db.select().from(suppliers)).toEqual([]);
  });

  it("rejects an Origin that is not the backoffice's own, creating nothing", async () => {
    const { headers } = await manager();

    const response = await app.inject({
      method: "POST",
      url: "/suppliers",
      headers: { ...headers, origin: "https://attacker.example" },
      payload: { name: "Distribuidora Sur" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await db.select().from(suppliers)).toEqual([]);
  });

  it("rejects a body the contract refuses with 400, creating nothing", async () => {
    const { headers } = await manager();

    const response = await app.inject({
      method: "POST",
      url: "/suppliers",
      headers,
      payload: { name: "   " },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    expect(await db.select().from(suppliers)).toEqual([]);
  });

  it("creates the supplier written by the signed-in user and answers it with 201", async () => {
    const { headers, userId } = await manager();

    const response = await app.inject({
      method: "POST",
      url: "/suppliers",
      headers,
      payload: { name: "  Distribuidora Sur ", cuit: FICTIONAL_CUIT, contact: "Marta" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toEqual({
      id: expect.any(String),
      name: "Distribuidora Sur",
      cuit: FICTIONAL_CUIT,
      contact: "Marta",
      note: null,
      active: true,
      version: 1,
    });
    expect(await db.select().from(suppliers)).toMatchObject([{ id: body.id, actorId: userId }]);
  });

  it("answers 409 supplier_name_taken for a name another supplier has", async () => {
    const { headers, userId } = await manager();
    await storedSupplier(userId);

    const response = await app.inject({
      method: "POST",
      url: "/suppliers",
      headers,
      payload: { name: "distribuidora sur" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "supplier_name_taken" });
  });

  it("answers 409 supplier_cuit_taken for a tax id another supplier has", async () => {
    const { headers, userId } = await manager();
    await storedSupplier(userId, { cuit: FICTIONAL_CUIT });

    const response = await app.inject({
      method: "POST",
      url: "/suppliers",
      headers,
      payload: { name: "Otra", cuit: FICTIONAL_CUIT },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "supplier_cuit_taken" });
  });
});

describe("PUT /suppliers/:id", () => {
  it("returns 403 to a user without the suppliers permission, changing nothing", async () => {
    const { headers } = await signedInWith(db, ["sell_and_charge"], NOW);
    const owner = await insertActor(db);
    const supplier = await storedSupplier(owner);

    const response = await app.inject({
      method: "PUT",
      url: `/suppliers/${supplier.id}`,
      headers,
      payload: { name: "Nuevo", version: supplier.version },
    });

    expect(response.statusCode).toBe(403);
    expect(await db.select().from(suppliers)).toMatchObject([{ name: "Distribuidora Sur" }]);
  });

  it("edits the supplier, answering it at its next version", async () => {
    const { headers, userId } = await manager();
    const supplier = await storedSupplier(userId);

    const response = await app.inject({
      method: "PUT",
      url: `/suppliers/${supplier.id}`,
      headers,
      payload: { name: "Nuevo", cuit: ANOTHER_FICTIONAL_CUIT, note: "Martes", version: 1 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: supplier.id,
      name: "Nuevo",
      cuit: ANOTHER_FICTIONAL_CUIT,
      contact: null,
      note: "Martes",
      active: true,
      version: 2,
    });
  });

  it("answers 404 for a supplier that does not exist", async () => {
    const { headers } = await manager();

    const response = await app.inject({
      method: "PUT",
      url: `/suppliers/${MISSING_ID}`,
      headers,
      payload: { name: "Nuevo", version: 1 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers 400 for an id that is not a record id", async () => {
    const { headers } = await manager();

    const response = await app.inject({
      method: "PUT",
      url: "/suppliers/not-an-id",
      headers,
      payload: { name: "Nuevo", version: 1 },
    });

    expect(response.statusCode).toBe(400);
  });

  it("answers 409 stale_version for a supplier changed since it was loaded, changing nothing", async () => {
    const { headers, userId } = await manager();
    const supplier = await storedSupplier(userId, { version: 4 });

    const response = await app.inject({
      method: "PUT",
      url: `/suppliers/${supplier.id}`,
      headers,
      payload: { name: "Nuevo", version: 1 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    expect(await db.select().from(suppliers)).toMatchObject([{ name: "Distribuidora Sur" }]);
  });

  it("answers 409 supplier_name_taken and supplier_cuit_taken for what another supplier has", async () => {
    const { headers, userId } = await manager();
    await storedSupplier(userId, { name: "Uno", cuit: FICTIONAL_CUIT });
    const second = await storedSupplier(userId, { name: "Dos" });

    const nameTaken = await app.inject({
      method: "PUT",
      url: `/suppliers/${second.id}`,
      headers,
      payload: { name: "UNO", version: 1 },
    });
    const cuitTaken = await app.inject({
      method: "PUT",
      url: `/suppliers/${second.id}`,
      headers,
      payload: { name: "Dos", cuit: FICTIONAL_CUIT, version: 1 },
    });

    expect(nameTaken.statusCode).toBe(409);
    expect(nameTaken.json()).toMatchObject({ code: "supplier_name_taken" });
    expect(cuitTaken.statusCode).toBe(409);
    expect(cuitTaken.json()).toMatchObject({ code: "supplier_cuit_taken" });
  });
});

describe("PUT and DELETE /suppliers/:id/deactivation", () => {
  it("returns 403 to a user without the suppliers permission, changing nothing", async () => {
    const { headers } = await signedInWith(db, ["sell_and_charge"], NOW);
    const owner = await insertActor(db);
    const supplier = await storedSupplier(owner);
    const inactive = await storedSupplier(owner, { name: "Inactiva", active: false });

    const deactivation = await app.inject({
      method: "PUT",
      url: `/suppliers/${supplier.id}/deactivation`,
      headers,
    });
    const reactivation = await app.inject({
      method: "DELETE",
      url: `/suppliers/${inactive.id}/deactivation`,
      headers,
    });

    expect(deactivation.statusCode).toBe(403);
    expect(reactivation.statusCode).toBe(403);
    expect(await db.select({ active: suppliers.active }).from(suppliers)).toEqual(
      expect.arrayContaining([{ active: true }, { active: false }]),
    );
  });

  it("deactivates then reactivates the supplier, written by the signed-in user", async () => {
    const { headers, userId } = await manager();
    const owner = await insertActor(db);
    const supplier = await storedSupplier(owner);

    const deactivation = await app.inject({
      method: "PUT",
      url: `/suppliers/${supplier.id}/deactivation`,
      headers,
    });
    const [deactivated] = await db.select().from(suppliers).where(eq(suppliers.id, supplier.id));
    const reactivation = await app.inject({
      method: "DELETE",
      url: `/suppliers/${supplier.id}/deactivation`,
      headers,
    });
    const [reactivated] = await db.select().from(suppliers).where(eq(suppliers.id, supplier.id));

    expect(deactivation.statusCode).toBe(200);
    expect(deactivated).toMatchObject({ active: false, version: 2, actorId: userId });
    expect(reactivation.statusCode).toBe(200);
    expect(reactivated).toMatchObject({ active: true, version: 3, actorId: userId });
  });

  it("answers 404 for a supplier that does not exist", async () => {
    const { headers } = await manager();

    const deactivation = await app.inject({
      method: "PUT",
      url: `/suppliers/${MISSING_ID}/deactivation`,
      headers,
    });
    const reactivation = await app.inject({
      method: "DELETE",
      url: `/suppliers/${MISSING_ID}/deactivation`,
      headers,
    });

    expect(deactivation.statusCode).toBe(404);
    expect(reactivation.statusCode).toBe(404);
  });

  it("answers 409 supplier_already_inactive and supplier_already_active", async () => {
    const { headers, userId } = await manager();
    const active = await storedSupplier(userId, { name: "Activa" });
    const inactive = await storedSupplier(userId, { name: "Inactiva", active: false });

    const alreadyInactive = await app.inject({
      method: "PUT",
      url: `/suppliers/${inactive.id}/deactivation`,
      headers,
    });
    const alreadyActive = await app.inject({
      method: "DELETE",
      url: `/suppliers/${active.id}/deactivation`,
      headers,
    });

    expect(alreadyInactive.statusCode).toBe(409);
    expect(alreadyInactive.json()).toMatchObject({ code: "supplier_already_inactive" });
    expect(alreadyActive.statusCode).toBe(409);
    expect(alreadyActive.json()).toMatchObject({ code: "supplier_already_active" });
  });

  it("answers 400 for an id that is not a record id", async () => {
    const { headers } = await manager();

    const response = await app.inject({
      method: "PUT",
      url: "/suppliers/not-an-id/deactivation",
      headers,
    });

    expect(response.statusCode).toBe(400);
  });
});
