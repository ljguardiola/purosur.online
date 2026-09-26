import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createProduct,
  deactivateProduct,
  editProduct,
  fetchProducts,
  generateInternalBarcode,
  type ProductSummary,
  printLabels,
} from "./productsApi";

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

const miel: ProductSummary = {
  id: "product-1",
  name: "Miel pura de abeja 1 kg",
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  barcodes: ["7790987000015"],
  active: true,
  version: 1,
};

test("fetchProducts lists every product on 200, defaulting to the active filter", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [miel]));

  const outcome = await fetchProducts();

  expect(outcome).toEqual({ kind: "ok", value: [miel] });
  expect(fetch).toHaveBeenCalledWith("/products?status=active");
});

test.each(["active", "inactive", "all"] as const)(
  "fetchProducts sends the requested status filter %s",
  async (status) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [miel]));

    await fetchProducts(status);

    expect(fetch).toHaveBeenCalledWith(`/products?status=${status}`);
  },
);

test("fetchProducts returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await fetchProducts()).toEqual({ kind: "unauthenticated" });
});

test("fetchProducts returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchProducts()).toEqual({ kind: "forbidden" });
});

test("fetchProducts returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

  expect(await fetchProducts()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
});

test("fetchProducts returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await fetchProducts()).toEqual({ kind: "failed" });
});

test("fetchProducts returns failed on a malformed body", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { not: "an array" }));

  expect(await fetchProducts()).toEqual({ kind: "failed" });
});

const createInput = {
  name: "Miel pura de abeja 1 kg",
  categoryId: "category-1",
  saleUnit: "UNIT" as const,
  barcodes: ["7790987000015"],
};

test("createProduct posts the fields and returns the created product on 201", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, miel));

  const outcome = await createProduct(createInput);

  expect(outcome).toEqual({ kind: "ok", value: miel });
  expect(fetch).toHaveBeenCalledWith("/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createInput),
  });
});

test.each(["name", "categoryId", "saleUnit", "barcodes"] as const)(
  "createProduct returns validation_failed on field %s for a 400",
  async (field) => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", message: "invalid", details: [{ field }] }),
    );

    expect(await createProduct(createInput)).toEqual({ kind: "validation_failed", field });
  },
);

test("createProduct returns barcode_taken with the taken codes on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(409, { code: "barcode_taken", codes: ["7790987000015"] }),
  );

  expect(await createProduct(createInput)).toEqual({
    kind: "barcode_taken",
    codes: ["7790987000015"],
  });
});

test("createProduct returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await createProduct(createInput)).toEqual({ kind: "unauthenticated" });
});

test("createProduct returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await createProduct(createInput)).toEqual({ kind: "forbidden" });
});

test("createProduct returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

  expect(await createProduct(createInput)).toEqual({ kind: "rate_limited", retryAfterSeconds: 30 });
});

test("createProduct returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await createProduct(createInput)).toEqual({ kind: "failed" });
});

const editInput = { ...createInput, version: 1 };

test("editProduct posts the fields and version and returns the applied product on 200", async () => {
  const applied: ProductSummary = { ...miel, version: 2 };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, applied));

  const outcome = await editProduct("product-1", editInput);

  expect(outcome).toEqual({ kind: "ok", value: applied });
  expect(fetch).toHaveBeenCalledWith("/products/product-1/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(editInput),
  });
});

test.each(["name", "categoryId", "saleUnit", "barcodes", "version"] as const)(
  "editProduct returns validation_failed on field %s for a 400",
  async (field) => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", message: "invalid", details: [{ field }] }),
    );

    expect(await editProduct("product-1", editInput)).toEqual({
      kind: "validation_failed",
      field,
    });
  },
);

test("editProduct returns barcode_taken with the taken codes on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(409, { code: "barcode_taken", codes: ["7790987000015"] }),
  );

  expect(await editProduct("product-1", editInput)).toEqual({
    kind: "barcode_taken",
    codes: ["7790987000015"],
  });
});

test("editProduct returns stale_version on a 409 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "stale_version" }));

  expect(await editProduct("product-1", editInput)).toEqual({ kind: "stale_version" });
});

test("editProduct returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  expect(await editProduct("product-1", editInput)).toEqual({ kind: "not_found" });
});

test("editProduct returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await editProduct("product-1", editInput)).toEqual({ kind: "unauthenticated" });
});

test("editProduct returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await editProduct("product-1", editInput)).toEqual({ kind: "forbidden" });
});

test("editProduct returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "15" }));

  expect(await editProduct("product-1", editInput)).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 15,
  });
});

test("editProduct returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await editProduct("product-1", editInput)).toEqual({ kind: "failed" });
});

test("generateInternalBarcode posts with no body and returns the generated code on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { code: "2000000000015" }));

  const outcome = await generateInternalBarcode();

  expect(outcome).toEqual({ kind: "ok", code: "2000000000015" });
  expect(fetch).toHaveBeenCalledWith("/products/internal-barcode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
});

test("generateInternalBarcode returns failed on a body carrying no code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}));

  expect(await generateInternalBarcode()).toEqual({ kind: "failed" });
});

test("generateInternalBarcode returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await generateInternalBarcode()).toEqual({ kind: "unauthenticated" });
});

test("generateInternalBarcode returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await generateInternalBarcode()).toEqual({ kind: "forbidden" });
});

test("generateInternalBarcode returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "20" }));

  expect(await generateInternalBarcode()).toEqual({ kind: "rate_limited", retryAfterSeconds: 20 });
});

test("generateInternalBarcode returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await generateInternalBarcode()).toEqual({ kind: "failed" });
});

const labelRequest = [{ productId: "product-1", count: 3 }];

test("printLabels posts the requested labels and returns the pdf blob on 200", async () => {
  const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });
  vi.mocked(fetch).mockResolvedValue(new Response(pdf, { status: 200 }));

  const outcome = await printLabels(labelRequest);

  expect(outcome.kind).toBe("ok");
  expect(outcome.kind === "ok" && outcome.blob).toBeInstanceOf(Blob);
  expect(fetch).toHaveBeenCalledWith("/products/labels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ labels: labelRequest }),
  });
});

test("printLabels returns product_not_found on a 400 with that code", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "product_not_found", message: "no product", productId: "product-1" }),
  );

  expect(await printLabels(labelRequest)).toEqual({ kind: "product_not_found" });
});

test("printLabels returns product_without_internal_barcode on a 400 with that code", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, {
      code: "product_without_internal_barcode",
      message: "no internal barcode",
      productId: "product-1",
    }),
  );

  expect(await printLabels(labelRequest)).toEqual({ kind: "product_without_internal_barcode" });
});

test("printLabels returns failed on a 400 with an unrecognized code", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, {
      code: "validation_failed",
      message: "invalid",
      details: [{ field: "labels" }],
    }),
  );

  expect(await printLabels(labelRequest)).toEqual({ kind: "failed" });
});

test("printLabels returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await printLabels(labelRequest)).toEqual({ kind: "unauthenticated" });
});

test("printLabels returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await printLabels(labelRequest)).toEqual({ kind: "forbidden" });
});

test("printLabels returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "50" }));

  expect(await printLabels(labelRequest)).toEqual({ kind: "rate_limited", retryAfterSeconds: 50 });
});

test("printLabels returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await printLabels(labelRequest)).toEqual({ kind: "failed" });
});

test("deactivateProduct posts with no body and returns ok on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

  const outcome = await deactivateProduct("product-1");

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/products/product-1/deactivation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
});

test("deactivateProduct returns not_found on 404 for a missing or already-inactive product", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  expect(await deactivateProduct("product-1")).toEqual({ kind: "not_found" });
});

test("deactivateProduct returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await deactivateProduct("product-1")).toEqual({ kind: "unauthenticated" });
});

test("deactivateProduct returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await deactivateProduct("product-1")).toEqual({ kind: "forbidden" });
});

test("deactivateProduct returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "40" }));

  expect(await deactivateProduct("product-1")).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 40,
  });
});

test("deactivateProduct returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await deactivateProduct("product-1")).toEqual({ kind: "failed" });
});
