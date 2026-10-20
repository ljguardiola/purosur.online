import { SUPPLIER_PRICE_LIST_PDF_MAX_BYTES } from "@purosur/domain";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { supplierPriceLists } from "../platform/db/schema.js";
import { BACKOFFICE_ORIGIN, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER } from "./supplier-price-list-reading-task-identifier.js";
import { registerSupplierPriceListsRoutes } from "./supplier-price-lists-routes.js";
import { InMemorySupplierPriceListFiles } from "./test-support/in-memory-supplier-price-list-files.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";
import { insertSupplier } from "./test-support/supplier-price-list-fixtures.js";

const NOW = new Date("2026-09-16T15:00:00.000Z");
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let app: FastifyInstance;
let files: InMemorySupplierPriceListFiles;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("supplier_price_lists_routes");
  sql = postgres(integrationDb.databaseUrl, { max: 5 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(async () => {
  await sql`delete from supplier_price_list_rows`;
  await sql`delete from supplier_price_lists`;
  await sql`delete from graphile_worker._private_jobs`;
  files = new InMemorySupplierPriceListFiles();
  app = Fastify();
  registerSupplierPriceListsRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
    supplierPriceListFiles: files,
  });
});

afterEach(async () => {
  await app.close();
});

function queuedReadings() {
  return sql<{ payload: { listId: string } }[]>`
    select j.payload
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER}`;
}

async function upload(payload: Buffer) {
  const { headers, userId } = await signedInWith(db, ["manage_supplier_price_lists"], NOW);
  const supplierId = await insertSupplier(db, { actorId: await insertActor(db) });
  const response = await app.inject({
    method: "POST",
    url: `/supplier-price-lists?${new URLSearchParams({ supplierId, fileName: "lista.pdf" })}`,
    headers: { ...headers, "content-type": "application/pdf" },
    payload,
  });
  return { response, userId };
}

describe("POST /supplier-price-lists on a real Postgres", () => {
  it("stores the list and its file and queues its reading, answering 201", async () => {
    const { response, userId } = await upload(PDF);

    expect(response.statusCode).toBe(201);
    const { listId } = response.json();
    expect(await db.select().from(supplierPriceLists)).toMatchObject([
      { id: listId, state: "READING", fileName: "lista.pdf", uploadedBy: userId },
    ]);
    expect(files.stored.get(listId)).toEqual(new Uint8Array(PDF));
    expect(await queuedReadings()).toEqual([{ payload: { listId } }]);
  });

  it("queues no reading for an upload it refuses", async () => {
    const { response } = await upload(
      Buffer.concat([PDF, Buffer.alloc(SUPPLIER_PRICE_LIST_PDF_MAX_BYTES)]),
    );

    expect(response.statusCode).toBe(413);
    expect(await queuedReadings()).toEqual([]);
    expect(files.stored.size).toBe(0);
  });
});
