import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  confirmSupplierPriceList,
  discardSupplierPriceList,
  fetchSupplierPriceListReview,
  fetchSupplierPriceLists,
  removeSupplierPriceListRow,
  setSupplierPriceListRowPrice,
  uploadSupplierPriceList,
} from "./supplier-price-lists-api";
import { EXTRACTED_ROWS, READ_LIST, reviewOf } from "./test-support/supplier-price-lists";

function jsonResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  return new Response(
    body === undefined ? null : JSON.stringify(body),
    headers ? { status, headers } : { status },
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const JSON_BODY = { headers: { "Content-Type": "application/json" } };

const refusals = [
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
] as const;

describe("fetchSupplierPriceLists", () => {
  test("lists every price list on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [READ_LIST]));

    expect(await fetchSupplierPriceLists()).toEqual({ kind: "ok", value: [READ_LIST] });
    expect(fetch).toHaveBeenCalledWith("/api/supplier-price-lists");
  });

  test("returns failed when a listed price list does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [{ ...READ_LIST, state: "UNKNOWN" }]));

    expect(await fetchSupplierPriceLists()).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchSupplierPriceLists()).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await fetchSupplierPriceLists()).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 45,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchSupplierPriceLists()).toEqual({ kind: "failed" });
  });
});

describe("fetchSupplierPriceListReview", () => {
  const review = reviewOf(READ_LIST, EXTRACTED_ROWS);

  test("reads the list with its rows on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, review));

    expect(await fetchSupplierPriceListReview("list-1")).toEqual({
      kind: "ok",
      value: { kind: "found", review },
    });
    expect(fetch).toHaveBeenCalledWith("/api/supplier-price-lists/list-1");
  });

  test("answers a list that is no longer there on 404", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

    expect(await fetchSupplierPriceListReview("list-1")).toEqual({
      kind: "ok",
      value: { kind: "not_found" },
    });
  });

  test("returns failed when the body does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { list: {}, rows: [] }));

    expect(await fetchSupplierPriceListReview("list-1")).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchSupplierPriceListReview("list-1")).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

    expect(await fetchSupplierPriceListReview("list-1")).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 30,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchSupplierPriceListReview("list-1")).toEqual({ kind: "failed" });
  });
});

describe("uploadSupplierPriceList", () => {
  const file = new File(["%PDF-1.7"], "lista septiembre.pdf", { type: "application/pdf" });
  const query = { supplierId: "supplier-1", fileName: "lista septiembre.pdf" };

  test("posts the file's bytes as a PDF with the supplier and the file name in the query", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { listId: "list-1" }));

    expect(await uploadSupplierPriceList(query, file)).toEqual({ kind: "ok" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/supplier-price-lists?supplierId=supplier-1&fileName=lista+septiembre.pdf",
      { method: "POST", headers: { "Content-Type": "application/pdf" }, body: file },
    );
  });

  test.each([
    ["without a body", undefined],
    ["without the list's id", {}],
    ["with an id that is not text", { listId: 7 }],
  ])("returns failed for an upload answered %s", async (_name, body) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, body));

    expect(await uploadSupplierPriceList(query, file)).toEqual({ kind: "failed" });
  });

  test.each([
    [404, { code: "supplier_not_found" }, { kind: "supplier_not_found" }],
    [409, { code: "supplier_inactive" }, { kind: "supplier_inactive" }],
    [409, { code: "daily_cap_reached", cap: 10 }, { kind: "daily_cap_reached", cap: 10 }],
    [413, { code: "file_too_large" }, { kind: "file_too_large" }],
    [415, { code: "not_a_pdf" }, { kind: "not_a_pdf" }],
    [503, { code: "supplier_price_list_reading_unavailable" }, { kind: "reading_unavailable" }],
  ])("answers a %i with %j as %j", async (status, body, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status, body));

    expect(await uploadSupplierPriceList(query, file)).toEqual(outcome);
  });

  test("returns failed on a 409 with another code or a cap that is not a number", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "daily_cap_reached", cap: "x" }));
    expect(await uploadSupplierPriceList(query, file)).toEqual({ kind: "failed" });

    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "other" }));
    expect(await uploadSupplierPriceList(query, file)).toEqual({ kind: "failed" });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "supplierId" }] }),
    );

    expect(await uploadSupplierPriceList(query, file)).toEqual({
      kind: "validation_failed",
      field: "supplierId",
    });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await uploadSupplierPriceList(query, file)).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "60" }));

    expect(await uploadSupplierPriceList(query, file)).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 60,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await uploadSupplierPriceList(query, file)).toEqual({ kind: "failed" });
  });
});

const reviewChanges = [
  [
    "setSupplierPriceListRowPrice",
    () => setSupplierPriceListRowPrice("list-1", "row-1", { priceCents: 1500, version: 3 }),
    "PUT",
    "/api/supplier-price-lists/list-1/rows/row-1/price",
    { priceCents: 1500, version: 3 },
  ],
  [
    "removeSupplierPriceListRow",
    () => removeSupplierPriceListRow("list-1", "row-1", { version: 3 }),
    "DELETE",
    "/api/supplier-price-lists/list-1/rows/row-1",
    { version: 3 },
  ],
  [
    "confirmSupplierPriceList",
    () => confirmSupplierPriceList("list-1", { version: 3, listDate: "2026-09-25" }),
    "POST",
    "/api/supplier-price-lists/list-1/confirmation",
    { version: 3, listDate: "2026-09-25" },
  ],
  [
    "discardSupplierPriceList",
    () => discardSupplierPriceList("list-1", { version: 3 }),
    "POST",
    "/api/supplier-price-lists/list-1/discard",
    { version: 3 },
  ],
] as const;

describe.each(reviewChanges)("%s", (_name, change, method, path, body) => {
  test("sends the request body and returns ok on 200 whatever the body says", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { unexpected: true }));

    expect(await change()).toEqual({ kind: "ok" });
    expect(fetch).toHaveBeenCalledWith(path, {
      method,
      ...JSON_BODY,
      body: JSON.stringify(body),
    });
  });

  test("returns not_found on a 404", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

    expect(await change()).toEqual({ kind: "not_found" });
  });

  test.each([
    ["not_editable", { kind: "not_editable" }],
    ["stale_version", { kind: "stale_version" }],
    ["something_else", { kind: "failed" }],
  ])("answers a 409 with the code %s as %j", async (code, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code }));

    expect(await change()).toEqual(outcome);
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "version" }] }),
    );

    expect(await change()).toEqual({ kind: "validation_failed", field: "version" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await change()).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "20" }));

    expect(await change()).toEqual({ kind: "rate_limited", retryAfterSeconds: 20 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await change()).toEqual({ kind: "failed" });
  });
});

describe("confirmSupplierPriceList refusals", () => {
  test.each([
    ["no_rows", { kind: "no_rows" }],
    ["unpriced_rows", { kind: "unpriced_rows" }],
    ["list_date_missing", { kind: "list_date_missing" }],
  ])("answers a 409 with the code %s as %j", async (code, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code }));

    expect(await confirmSupplierPriceList("list-1", { version: 3, listDate: null })).toEqual(
      outcome,
    );
  });

  test("sends a missing date as null", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

    await confirmSupplierPriceList("list-1", { version: 3, listDate: null });

    expect(fetch).toHaveBeenCalledWith(
      "/api/supplier-price-lists/list-1/confirmation",
      expect.objectContaining({ body: JSON.stringify({ version: 3, listDate: null }) }),
    );
  });
});
