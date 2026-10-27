import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createProductFromSupplierItem,
  fetchProductCreationCategories,
  generateSupplierItemInternalBarcode,
} from "./supplier-item-products-api";
import {
  CREATION_BODY,
  CREATION_CATEGORIES,
  PRODUCT_CREATED,
} from "./test-support/supplier-item-products";

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

describe("createProductFromSupplierItem", () => {
  test("posts the product to create for the row of the list and returns what the cloud created", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, PRODUCT_CREATED));

    const outcome = await createProductFromSupplierItem("list-1", "row-1", CREATION_BODY);

    expect(outcome).toEqual({ kind: "ok", created: PRODUCT_CREATED });
    expect(fetch).toHaveBeenCalledWith("/api/supplier-price-lists/list-1/rows/row-1/product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(CREATION_BODY),
    });
  });

  test("sends only the fields of the creation body", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, PRODUCT_CREATED));

    await createProductFromSupplierItem("list-1", "row-1", {
      ...CREATION_BODY,
      extra: "ignored",
    } as typeof CREATION_BODY);

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(init?.body).toBe(JSON.stringify(CREATION_BODY));
  });

  test("returns failed when the created product does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { productId: 7 }));

    expect(await createProductFromSupplierItem("list-1", "row-1", CREATION_BODY)).toEqual({
      kind: "failed",
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await createProductFromSupplierItem("list-1", "row-1", CREATION_BODY)).toEqual({
      kind: "failed",
    });
  });

  test("returns the field a 400 validation failure names", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "categoryId" }] }),
    );

    expect(await createProductFromSupplierItem("list-1", "row-1", CREATION_BODY)).toEqual({
      kind: "validation_failed",
      field: "categoryId",
    });
  });

  test("returns failed on a 400 that names no field", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, {}));

    expect(await createProductFromSupplierItem("list-1", "row-1", CREATION_BODY)).toEqual({
      kind: "failed",
    });
  });

  test.each([
    [401, { kind: "unauthenticated" }],
    [403, { kind: "forbidden" }],
    [404, { kind: "not_found" }],
    [500, { kind: "failed" }],
  ] as const)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await createProductFromSupplierItem("list-1", "row-1", CREATION_BODY)).toEqual(outcome);
  });

  test.each([
    "not_editable",
    "stale_version",
    "already_linked",
    "vat_rate_missing",
    "vat_rate_invalid",
    "category_not_leaf",
    "name_too_long",
    "presentation_too_long",
  ] as const)("answers a 409 %s as that refusal", async (code) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code }));

    expect(await createProductFromSupplierItem("list-1", "row-1", CREATION_BODY)).toEqual({
      kind: code,
    });
  });

  test("answers a 409 barcode_taken with the codes that belong to other products", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(409, { code: "barcode_taken", codes: ["7790001000029"] }),
    );

    expect(await createProductFromSupplierItem("list-1", "row-1", CREATION_BODY)).toEqual({
      kind: "barcode_taken",
      codes: ["7790001000029"],
    });
  });

  test("answers a 409 barcode_taken naming no code with an empty list", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "barcode_taken" }));

    expect(await createProductFromSupplierItem("list-1", "row-1", CREATION_BODY)).toEqual({
      kind: "barcode_taken",
      codes: [],
    });
  });

  test("answers an unknown 409 as failed", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "something_else" }));

    expect(await createProductFromSupplierItem("list-1", "row-1", CREATION_BODY)).toEqual({
      kind: "failed",
    });
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

    expect(await createProductFromSupplierItem("list-1", "row-1", CREATION_BODY)).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 30,
    });
  });
});

describe("fetchProductCreationCategories", () => {
  test("reads the categories the product can be filed under", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, CREATION_CATEGORIES));

    expect(await fetchProductCreationCategories()).toEqual({
      kind: "ok",
      value: CREATION_CATEGORIES,
    });
    expect(fetch).toHaveBeenCalledWith("/api/supplier-price-lists/product-categories");
  });

  test("returns failed when the categories do not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [{ id: 1 }]));

    expect(await fetchProductCreationCategories()).toEqual({ kind: "failed" });
  });

  test.each([
    [401, { kind: "unauthenticated" }],
    [403, { kind: "forbidden" }],
    [500, { kind: "failed" }],
  ] as const)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchProductCreationCategories()).toEqual(outcome);
  });
});

describe("generateSupplierItemInternalBarcode", () => {
  test("posts the barcodes the product already has and returns the generated code", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { code: "2000000000015" }));

    expect(await generateSupplierItemInternalBarcode({ barcodes: [] })).toEqual({
      kind: "ok",
      code: "2000000000015",
    });
    expect(fetch).toHaveBeenCalledWith("/api/supplier-price-lists/internal-barcodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barcodes: [] }),
    });
  });

  test("returns failed when the code is not an internal barcode", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { code: "7790987000015" }));

    expect(await generateSupplierItemInternalBarcode({ barcodes: [] })).toEqual({
      kind: "failed",
    });
  });

  test.each([
    [401, { kind: "unauthenticated" }],
    [403, { kind: "forbidden" }],
    [429, { kind: "rate_limited", retryAfterSeconds: 30 }],
    [500, { kind: "failed" }],
  ] as const)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status, undefined, { "Retry-After": "30" }));

    expect(await generateSupplierItemInternalBarcode({ barcodes: [] })).toEqual(outcome);
  });
});
