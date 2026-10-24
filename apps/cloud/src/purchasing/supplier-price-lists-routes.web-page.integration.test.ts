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
import { FakeSupplierPriceListWebPages } from "./test-support/fake-supplier-price-list-web-pages.js";
import { InMemorySupplierPriceListFiles } from "./test-support/in-memory-supplier-price-list-files.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";
import { insertPriceList, insertSupplier } from "./test-support/supplier-price-list-fixtures.js";

const NOW = new Date("2026-09-16T15:00:00.000Z");
const WEB_PAGE_URL = "https://distribuidora-sur.example/lista";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let app: FastifyInstance;
let files: InMemorySupplierPriceListFiles;
let webPages: FakeSupplierPriceListWebPages;
let headers: Record<string, string>;
let userId: string;
let locationId: string;
let supplierId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("supplier_price_lists_web_page_routes");
  sql = postgres(integrationDb.databaseUrl, { max: 5 });
  db = drizzle(sql);
  ({ headers, userId, locationId } = await signedInWith(db, ["manage_supplier_price_lists"], NOW));
  supplierId = await insertSupplier(db, { actorId: await insertActor(db) });
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
  webPages = new FakeSupplierPriceListWebPages();
  app = Fastify();
  registerSupplierPriceListsRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
    supplierPriceListFiles: files,
    supplierPriceListWebPages: webPages,
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

describe("POST /supplier-price-lists/web-page on a real Postgres", () => {
  it("reads the page, keeps it with its kind and queues the reading, answering 201 with the list", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/supplier-price-lists/web-page",
      headers,
      payload: { supplierId, url: WEB_PAGE_URL },
    });

    expect(response.statusCode).toBe(201);
    const { listId } = response.json();
    expect(webPages.urls).toEqual([WEB_PAGE_URL]);
    expect(await db.select().from(supplierPriceLists)).toMatchObject([
      {
        id: listId,
        supplierId,
        locationId,
        sourceKind: "WEB_PAGE",
        sourceUrl: WEB_PAGE_URL,
        fileName: null,
        fileContentKind: "HTML",
        state: "READING",
        uploadedBy: userId,
      },
    ]);
    expect(files.stored.get(listId)?.contentKind).toBe("HTML");
    expect(await queuedReadings()).toEqual([{ payload: { listId } }]);
  });

  it("queues no reading for a page it refuses", async () => {
    webPages.answer = { kind: "refused", reason: "too_slow" };

    const response = await app.inject({
      method: "POST",
      url: "/supplier-price-lists/web-page",
      headers,
      payload: { supplierId, url: WEB_PAGE_URL },
    });

    expect(response.statusCode).toBe(422);
    expect(await queuedReadings()).toEqual([]);
    expect(files.stored.size).toBe(0);
  });
});

describe("POST /supplier-price-lists/:id/refresh on a real Postgres", () => {
  it("reads the stored address again into a new list of the same supplier and queues its reading, answering 201", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId: userId,
      sourceUrl: WEB_PAGE_URL,
      state: "REVIEWED",
    });

    const response = await app.inject({
      method: "POST",
      url: `/supplier-price-lists/${listId}/refresh`,
      headers,
    });

    expect(response.statusCode).toBe(201);
    const { listId: refreshedId } = response.json();
    expect(refreshedId).not.toBe(listId);
    expect(webPages.urls).toEqual([WEB_PAGE_URL]);
    const lists = await db.select().from(supplierPriceLists);
    expect(lists.find((list) => list.id === refreshedId)).toMatchObject({
      supplierId,
      locationId,
      sourceKind: "WEB_PAGE",
      sourceUrl: WEB_PAGE_URL,
      state: "READING",
    });
    expect(lists.find((list) => list.id === listId)?.state).toBe("REVIEWED");
    expect(files.stored.get(refreshedId)?.contentKind).toBe("HTML");
    expect(await queuedReadings()).toEqual([{ payload: { listId: refreshedId } }]);
  });
});
