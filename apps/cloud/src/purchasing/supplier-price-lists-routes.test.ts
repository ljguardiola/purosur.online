import { SUPPLIER_PRICE_LIST_PDF_MAX_BYTES } from "@purosur/domain";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  supplierPriceListExtractionCaps,
  supplierPriceListRows,
  supplierPriceLists,
} from "../platform/db/schema.js";
import { BACKOFFICE_ORIGIN, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerSupplierPriceListsRoutes } from "./supplier-price-lists-routes.js";
import { InMemorySupplierPriceListFiles } from "./test-support/in-memory-supplier-price-list-files.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";
import {
  insertPriceList,
  insertPriceListRows,
  insertSupplier,
} from "./test-support/supplier-price-list-fixtures.js";

const NOW = new Date("2026-09-16T15:00:00.000Z");
const MISSING_ID = "00000000-0000-4000-8000-000000000000";
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let files: InMemorySupplierPriceListFiles;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
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

async function manager() {
  return signedInWith(db, ["manage_supplier_price_lists"], NOW);
}

async function storedList(
  seed: Partial<Parameters<typeof insertPriceList>[1]> = {},
): Promise<{ listId: string; supplierId: string; locationId: string; actorId: string }> {
  const actorId = await insertActor(db);
  const locationId = await seededLocationId(db);
  const supplierId = await insertSupplier(db, { actorId });
  const listId = await insertPriceList(db, { supplierId, locationId, actorId, ...seed });
  return { listId, supplierId, locationId, actorId };
}

async function storedSupplier(active = true): Promise<string> {
  return insertSupplier(db, { actorId: await insertActor(db), active });
}

async function listRow(listId: string) {
  const [row] = await db.select().from(supplierPriceLists).where(eq(supplierPriceLists.id, listId));
  return row;
}

describe("authorization of every supplier price list route", () => {
  const routes = [
    ["GET", "/supplier-price-lists"],
    ["GET", `/supplier-price-lists/${MISSING_ID}`],
    ["GET", `/supplier-price-lists/${MISSING_ID}/file`],
    ["POST", `/supplier-price-lists?supplierId=${MISSING_ID}&fileName=lista.pdf`],
    ["PUT", `/supplier-price-lists/${MISSING_ID}/rows/${MISSING_ID}/price`],
    ["DELETE", `/supplier-price-lists/${MISSING_ID}/rows/${MISSING_ID}`],
    ["POST", `/supplier-price-lists/${MISSING_ID}/confirmation`],
    ["POST", `/supplier-price-lists/${MISSING_ID}/discard`],
  ] as const;

  it.each(routes)("%s %s answers 401 when no session cookie was sent", async (method, url) => {
    const response = await app.inject({ method, url, headers: { origin: BACKOFFICE_ORIGIN } });

    expect(response.statusCode).toBe(401);
  });

  it.each(routes)("%s %s answers 403 to a user without the permission", async (method, url) => {
    const { headers } = await signedInWith(db, ["record_purchases"], NOW);

    const response = await app.inject({ method, url, headers });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });
});

describe("GET /supplier-price-lists", () => {
  it("lists the lists newest upload first, marking a replaced one", async () => {
    const { headers } = await manager();
    const older = await storedList({
      state: "REVIEWED",
      listDate: "2026-03-01",
      confirmedAt: new Date("2026-03-02T12:00:00.000Z"),
      uploadedAt: new Date("2026-03-02T11:00:00.000Z"),
      fileName: "marzo.pdf",
    });
    await insertPriceList(db, {
      supplierId: older.supplierId,
      locationId: older.locationId,
      actorId: older.actorId,
      state: "REVIEWED",
      listDate: "2026-04-01",
      confirmedAt: new Date("2026-04-02T12:00:00.000Z"),
      uploadedAt: new Date("2026-04-02T11:00:00.000Z"),
      fileName: "abril.pdf",
    });

    const response = await app.inject({ method: "GET", url: "/supplier-price-lists", headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([
      { fileName: "abril.pdf", state: "REVIEWED", replaced: false },
      {
        id: older.listId,
        fileName: "marzo.pdf",
        replaced: true,
        uploadedAt: "2026-03-02T11:00:00.000Z",
      },
    ]);
  });
});

describe("GET /supplier-price-lists/:id", () => {
  it("answers the list with its rows and whether a newer list replaced it", async () => {
    const { headers } = await manager();
    const { listId } = await storedList({
      state: "EXTRACTED",
      listDate: "2026-03-01",
      pricesIncludeVat: false,
    });
    await insertPriceListRows(db, listId, [
      {
        description: "Yerba 1 kg",
        code: "Y1",
        presentation: "Paquete",
        priceCents: 250_000,
        page: 2,
      },
    ]);

    const response = await app.inject({
      method: "GET",
      url: `/supplier-price-lists/${listId}`,
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      list: {
        id: listId,
        state: "EXTRACTED",
        version: 1,
        replaced: false,
        pricesIncludeVat: false,
      },
      actions: { changeRows: true, confirm: true, discard: true },
      rows: [
        {
          description: "Yerba 1 kg",
          code: "Y1",
          presentation: "Paquete",
          priceCents: 250_000,
          page: 2,
        },
      ],
    });
  });

  it("answers 404 for a list that does not exist", async () => {
    const { headers } = await manager();

    const response = await app.inject({
      method: "GET",
      url: `/supplier-price-lists/${MISSING_ID}`,
      headers,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers 400 for an id that is not a record id", async () => {
    const { headers } = await manager();

    const response = await app.inject({
      method: "GET",
      url: "/supplier-price-lists/not-an-id",
      headers,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });
});

describe("GET /supplier-price-lists/:id/file", () => {
  it("serves the stored PDF only as a download that is never rendered", async () => {
    const { headers } = await manager();
    const { listId } = await storedList({ fileName: "lista de marzo (ñ).pdf" });
    files.stored.set(listId, PDF);

    const response = await app.inject({
      method: "GET",
      url: `/supplier-price-lists/${listId}/file`,
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.equals(PDF)).toBe(true);
    expect(response.headers).toMatchObject({
      "content-type": "application/pdf",
      "content-disposition": "attachment; filename*=UTF-8''lista%20de%20marzo%20%28%C3%B1%29.pdf",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "cache-control": "no-store",
    });
  });

  it("answers 404 for a list that does not exist", async () => {
    const { headers } = await manager();

    const response = await app.inject({
      method: "GET",
      url: `/supplier-price-lists/${MISSING_ID}/file`,
      headers,
    });

    expect(response.statusCode).toBe(404);
  });

  it("answers 404 for a list whose file is not in the bucket", async () => {
    const { headers } = await manager();
    const { listId } = await storedList();

    const response = await app.inject({
      method: "GET",
      url: `/supplier-price-lists/${listId}/file`,
      headers,
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("POST /supplier-price-lists", () => {
  function upload(
    headers: Record<string, string>,
    query: Record<string, string>,
    payload: Buffer = PDF,
    contentType = "application/pdf",
  ) {
    return app.inject({
      method: "POST",
      url: `/supplier-price-lists?${new URLSearchParams(query)}`,
      headers: { ...headers, "content-type": contentType },
      payload,
    });
  }

  async function expectNothingStored() {
    expect(await db.select().from(supplierPriceLists)).toEqual([]);
    expect(files.stored.size).toBe(0);
  }

  it("rejects an Origin that is not the backoffice's own, storing nothing", async () => {
    const { headers } = await manager();
    const supplierId = await storedSupplier();

    const response = await upload(
      { ...headers, origin: "https://attacker.example" },
      { supplierId, fileName: "lista.pdf" },
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    await expectNothingStored();
  });

  it.each([
    ["no supplier", { fileName: "lista.pdf" }],
    ["a supplier that is not a record id", { supplierId: "x", fileName: "lista.pdf" }],
    ["no file name", { supplierId: MISSING_ID }],
    ["a blank file name", { supplierId: MISSING_ID, fileName: "  " }],
    ["a file name over the maximum length", { supplierId: MISSING_ID, fileName: "a".repeat(256) }],
  ])("answers 400 for %s, storing nothing", async (_name, query) => {
    const { headers } = await manager();

    const response = await upload(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    await expectNothingStored();
  });

  it.each([
    ["a page", Buffer.from("<html><body>hola</body></html>"), "application/pdf"],
    ["a file declared as something else", Buffer.from("PK\u0003\u0004zip"), "application/zip"],
    ["a JSON document", Buffer.from('{"a":1}'), "application/json"],
    ["an empty file", Buffer.alloc(0), "application/pdf"],
  ])("answers 415 not_a_pdf for %s, storing nothing", async (_name, bytes, contentType) => {
    const { headers } = await manager();
    const supplierId = await storedSupplier();

    const response = await upload(
      headers,
      { supplierId, fileName: "lista.pdf" },
      bytes,
      contentType,
    );

    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({ code: "not_a_pdf" });
    await expectNothingStored();
  });

  it.each([
    ["one byte", 1],
    ["well", 1_000_000],
  ])(
    "answers 413 file_too_large for a PDF %s over the maximum, storing nothing",
    async (_name, extra) => {
      const { headers } = await manager();
      const supplierId = await storedSupplier();
      const oversized = Buffer.concat([
        PDF,
        Buffer.alloc(SUPPLIER_PRICE_LIST_PDF_MAX_BYTES + extra - PDF.length),
      ]);

      const response = await upload(headers, { supplierId, fileName: "lista.pdf" }, oversized);

      expect(response.statusCode).toBe(413);
      expect(response.json()).toMatchObject({ code: "file_too_large" });
      await expectNothingStored();
    },
  );

  it("answers 404 supplier_not_found for a supplier that does not exist, storing nothing", async () => {
    const { headers } = await manager();

    const response = await upload(headers, { supplierId: MISSING_ID, fileName: "lista.pdf" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "supplier_not_found" });
    await expectNothingStored();
  });

  it("answers 409 supplier_inactive for a deactivated supplier, storing nothing", async () => {
    const { headers } = await manager();
    const supplierId = await storedSupplier(false);

    const response = await upload(headers, { supplierId, fileName: "lista.pdf" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "supplier_inactive" });
    await expectNothingStored();
  });

  it("answers 409 daily_cap_reached with the cap once the branch's extractions are used, storing no more", async () => {
    const { headers, locationId } = await manager();
    const supplierId = await storedSupplier();
    await storedList({ state: "READING" });
    await db.insert(supplierPriceListExtractionCaps).values({ locationId, dailyCap: 1 });

    const response = await upload(headers, { supplierId, fileName: "lista.pdf" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: "daily_cap_reached",
      message: expect.any(String),
      cap: 1,
    });
    expect(await db.select().from(supplierPriceLists)).toHaveLength(1);
    expect(files.stored.size).toBe(0);
  });

  it("answers 503 supplier_price_list_reading_unavailable when reading is not configured, storing nothing", async () => {
    const unconfigured = Fastify();
    registerSupplierPriceListsRoutes(unconfigured, {
      db,
      backofficeOrigin: BACKOFFICE_ORIGIN,
      now: () => NOW,
    });
    const { headers } = await manager();
    const supplierId = await storedSupplier();

    const response = await unconfigured.inject({
      method: "POST",
      url: `/supplier-price-lists?${new URLSearchParams({ supplierId, fileName: "lista.pdf" })}`,
      headers: { ...headers, "content-type": "application/pdf" },
      payload: PDF,
    });
    await unconfigured.close();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: "supplier_price_list_reading_unavailable" });
    expect(await db.select().from(supplierPriceLists)).toEqual([]);
  });
});

describe("PUT /supplier-price-lists/:id/rows/:rowId/price", () => {
  async function extractedListWithRow(priceCents: number | null = null) {
    const stored = await storedList({ state: "EXTRACTED", listDate: "2026-03-01" });
    const [rowId] = await insertPriceListRows(db, stored.listId, [{ priceCents }]);
    if (!rowId) {
      throw new Error("test setup: no row");
    }
    return { ...stored, rowId };
  }

  function setPrice(
    headers: Record<string, string>,
    listId: string,
    rowId: string,
    payload: unknown,
  ) {
    return app.inject({
      method: "PUT",
      url: `/supplier-price-lists/${listId}/rows/${rowId}/price`,
      headers,
      payload: payload as object,
    });
  }

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await setPrice(
      { ...headers, origin: "https://attacker.example" },
      listId,
      rowId,
      { priceCents: 100, version: 1 },
    );

    expect(response.statusCode).toBe(403);
    const [row] = await db
      .select()
      .from(supplierPriceListRows)
      .where(eq(supplierPriceListRows.id, rowId));
    expect(row?.priceCents).toBeNull();
  });

  it("answers 400 for a body the contract refuses", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await setPrice(headers, listId, rowId, { priceCents: -1, version: 1 });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("sets the price of the row and answers 200", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await setPrice(headers, listId, rowId, { priceCents: 123_450, version: 1 });

    expect(response.statusCode).toBe(200);
    const [row] = await db
      .select()
      .from(supplierPriceListRows)
      .where(eq(supplierPriceListRows.id, rowId));
    expect(row?.priceCents).toBe(123_450);
  });

  it("answers 404 for a row that is not in the list", async () => {
    const { headers } = await manager();
    const { listId } = await extractedListWithRow();

    const response = await setPrice(headers, listId, MISSING_ID, { priceCents: 100, version: 1 });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers 409 stale_version when the list changed since it was loaded", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await setPrice(headers, listId, rowId, { priceCents: 100, version: 7 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
  });

  it("answers 409 not_editable for a list that is no longer being reviewed", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    await db
      .update(supplierPriceLists)
      .set({ state: "DISCARDED" })
      .where(eq(supplierPriceLists.id, listId));

    const response = await setPrice(headers, listId, rowId, { priceCents: 100, version: 1 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "not_editable" });
  });
});

describe("DELETE /supplier-price-lists/:id/rows/:rowId", () => {
  async function extractedListWithRow() {
    const stored = await storedList({ state: "EXTRACTED", listDate: "2026-03-01" });
    const [rowId] = await insertPriceListRows(db, stored.listId, [{}]);
    if (!rowId) {
      throw new Error("test setup: no row");
    }
    return { ...stored, rowId };
  }

  function remove(headers: Record<string, string>, listId: string, rowId: string, payload: object) {
    return app.inject({
      method: "DELETE",
      url: `/supplier-price-lists/${listId}/rows/${rowId}`,
      headers,
      payload,
    });
  }

  it("answers 400 for a body without the loaded version", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await remove(headers, listId, rowId, {});

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("removes the row and answers 200", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await remove(headers, listId, rowId, { version: 1 });

    expect(response.statusCode).toBe(200);
    expect(
      await db.select().from(supplierPriceListRows).where(eq(supplierPriceListRows.id, rowId)),
    ).toEqual([]);
  });

  it("answers 404 for a row that is not in the list", async () => {
    const { headers } = await manager();
    const { listId } = await extractedListWithRow();

    const response = await remove(headers, listId, MISSING_ID, { version: 1 });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers 409 stale_version when the list changed since it was loaded", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();

    const response = await remove(headers, listId, rowId, { version: 9 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
  });

  it("answers 409 not_editable for a list that is no longer being reviewed", async () => {
    const { headers } = await manager();
    const { listId, rowId } = await extractedListWithRow();
    await db
      .update(supplierPriceLists)
      .set({ state: "REVIEWED" })
      .where(eq(supplierPriceLists.id, listId));

    const response = await remove(headers, listId, rowId, { version: 1 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "not_editable" });
  });
});

describe("POST /supplier-price-lists/:id/confirmation", () => {
  function confirm(headers: Record<string, string>, listId: string, payload: object) {
    return app.inject({
      method: "POST",
      url: `/supplier-price-lists/${listId}/confirmation`,
      headers,
      payload,
    });
  }

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const { headers } = await manager();
    const { listId } = await storedList({ state: "EXTRACTED", listDate: "2026-03-01" });
    await insertPriceListRows(db, listId, [{}]);

    const response = await confirm({ ...headers, origin: "https://attacker.example" }, listId, {
      version: 1,
    });

    expect(response.statusCode).toBe(403);
    expect((await listRow(listId))?.state).toBe("EXTRACTED");
  });

  it("answers 400 for a date that is not a calendar day", async () => {
    const { headers } = await manager();
    const { listId } = await storedList({ state: "EXTRACTED" });

    const response = await confirm(headers, listId, { version: 1, listDate: "2026-02-31" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("confirms a list of three thousand rows", async () => {
    const { headers } = await manager();
    const { listId } = await storedList({
      state: "EXTRACTED",
      listDate: "2026-03-01",
      pricesIncludeVat: true,
    });
    await insertPriceListRows(
      db,
      listId,
      Array.from({ length: 3_000 }, (_, index) => ({
        description: `Ítem ${index + 1}`,
        priceCents: 100 + index,
      })),
    );

    const response = await confirm(headers, listId, { version: 1 });

    expect(response.statusCode).toBe(200);
    expect((await listRow(listId))?.state).toBe("REVIEWED");
  });

  it("answers 400 for a VAT answer that is not a boolean", async () => {
    const { headers } = await manager();
    const { listId } = await storedList({ state: "EXTRACTED" });

    const response = await confirm(headers, listId, { version: 1, pricesIncludeVat: "yes" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("confirms the list with the date and the VAT answer chosen in the review and answers 200", async () => {
    const { headers, userId } = await manager();
    const { listId } = await storedList({ state: "EXTRACTED", pricesIncludeVat: true });
    await insertPriceListRows(db, listId, [{ priceCents: 500 }]);

    const response = await confirm(headers, listId, {
      version: 1,
      listDate: "2026-03-05",
      pricesIncludeVat: false,
    });

    expect(response.statusCode).toBe(200);
    expect(await listRow(listId)).toMatchObject({
      state: "REVIEWED",
      listDate: "2026-03-05",
      pricesIncludeVat: false,
      confirmedBy: userId,
    });
  });

  it("answers 404 for a list that does not exist", async () => {
    const { headers } = await manager();

    const response = await confirm(headers, MISSING_ID, { version: 1 });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it.each([
    ["no_rows", async (listId: string) => void listId],
    [
      "unpriced_rows",
      async (listId: string) =>
        void (await insertPriceListRows(db, listId, [{ priceCents: null }])),
    ],
    [
      "list_date_missing",
      async (listId: string) => {
        await insertPriceListRows(db, listId, [{ priceCents: 100 }]);
        await db
          .update(supplierPriceLists)
          .set({ listDate: null })
          .where(eq(supplierPriceLists.id, listId));
      },
    ],
    [
      "vat_missing",
      async (listId: string) => void (await insertPriceListRows(db, listId, [{ priceCents: 100 }])),
    ],
  ])("answers 409 %s and leaves the list unconfirmed", async (code, arrange) => {
    const { headers } = await manager();
    const { listId } = await storedList({ state: "EXTRACTED", listDate: "2026-03-01" });
    await arrange(listId);

    const response = await confirm(headers, listId, { version: 1 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code });
    expect((await listRow(listId))?.state).toBe("EXTRACTED");
  });

  it("answers 409 stale_version when the list changed since it was loaded", async () => {
    const { headers } = await manager();
    const { listId } = await storedList({ state: "EXTRACTED", listDate: "2026-03-01" });

    const response = await confirm(headers, listId, { version: 4 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
  });

  it("answers 409 not_editable for a list that is not waiting for review", async () => {
    const { headers } = await manager();
    const { listId } = await storedList({ state: "READING" });

    const response = await confirm(headers, listId, { version: 1 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "not_editable" });
  });
});

describe("POST /supplier-price-lists/:id/discard", () => {
  function discard(headers: Record<string, string>, listId: string, payload: object) {
    return app.inject({
      method: "POST",
      url: `/supplier-price-lists/${listId}/discard`,
      headers,
      payload,
    });
  }

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const { headers } = await manager();
    const { listId } = await storedList({ state: "EXTRACTED" });

    const response = await discard({ ...headers, origin: "https://attacker.example" }, listId, {
      version: 1,
    });

    expect(response.statusCode).toBe(403);
    expect((await listRow(listId))?.state).toBe("EXTRACTED");
  });

  it("discards the list and answers 200", async () => {
    const { headers, userId } = await manager();
    const { listId } = await storedList({ state: "EXTRACTED" });

    const response = await discard(headers, listId, { version: 1 });

    expect(response.statusCode).toBe(200);
    expect(await listRow(listId)).toMatchObject({ state: "DISCARDED", discardedBy: userId });
  });

  it("answers 400 for a body without the loaded version", async () => {
    const { headers } = await manager();
    const { listId } = await storedList({ state: "EXTRACTED" });

    const response = await discard(headers, listId, {});

    expect(response.statusCode).toBe(400);
  });

  it("answers 404 for a list that does not exist", async () => {
    const { headers } = await manager();

    const response = await discard(headers, MISSING_ID, { version: 1 });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers 409 stale_version when the list changed since it was loaded", async () => {
    const { headers } = await manager();
    const { listId } = await storedList({ state: "EXTRACTED" });

    const response = await discard(headers, listId, { version: 3 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
  });

  it("answers 409 not_editable for a list already confirmed", async () => {
    const { headers } = await manager();
    const { listId } = await storedList({ state: "REVIEWED" });

    const response = await discard(headers, listId, { version: 1 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "not_editable" });
  });
});
