import type { ProductSummary } from "@purosur/contracts";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createProduct,
  deactivateProduct,
  editProduct,
  fetchProducts,
  generateInternalBarcode,
  printLabels,
  reactivateProduct,
} from "./products-api";

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

const honey: ProductSummary = {
  id: "product-1",
  name: "Miel pura de abeja 1 kg",
  categoryId: "category-1",
  brandId: null,
  categoryName: "Almacén",
  saleUnit: "UNIT",
  barcodes: ["7790987000015"],
  tagIds: [],
  netContent: null,
  active: true,
  labelCode: null,
  labelModules: null,
  version: 1,
};

test("fetchProducts lists every product on 200, defaulting to the active filter", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [honey]));

  const outcome = await fetchProducts();

  expect(outcome).toEqual({ kind: "ok", value: [honey] });
  expect(fetch).toHaveBeenCalledWith("/api/products?status=active");
});

test.each(["active", "inactive", "all"] as const)(
  "fetchProducts sends the requested status filter %s",
  async (status) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [honey]));

    await fetchProducts(status);

    expect(fetch).toHaveBeenCalledWith(`/api/products?status=${status}`);
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
  brandId: null,
  saleUnit: "UNIT" as const,
  barcodes: ["7790987000015"],
  tagIds: [],
  netContent: null,
};

test("createProduct posts the fields and returns ok on 201", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, honey));

  const outcome = await createProduct(createInput);

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createInput),
  });
});

test("createProduct posts a given net content", async () => {
  const withNetContent = { ...createInput, netContent: { quantity: 380, unit: "G" as const } };
  const created: ProductSummary = { ...honey, netContent: withNetContent.netContent };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, created));

  const outcome = await createProduct(withNetContent);

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withNetContent),
  });
});

test("createProduct posts only the fields the cloud reads", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, honey));
  const withExtraFields = { ...createInput, active: false };

  await createProduct(withExtraFields);

  expect(fetch).toHaveBeenCalledWith(
    "/api/products",
    expect.objectContaining({ body: JSON.stringify(createInput) }),
  );
});

test("editProduct puts only the fields the cloud reads", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, honey));
  const withExtraFields = { ...editInput, active: false };

  await editProduct("product-1", withExtraFields);

  expect(fetch).toHaveBeenCalledWith(
    "/api/products/product-1",
    expect.objectContaining({ body: JSON.stringify(editInput) }),
  );
});

test.each([
  "name",
  "categoryId",
  "saleUnit",
  "barcodes",
  "netContent",
  "netContentQuantity",
] as const)("createProduct returns validation_failed on field %s for a 400", async (field) => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", message: "invalid", details: [{ field }] }),
  );

  expect(await createProduct(createInput)).toEqual({ kind: "validation_failed", field });
});

test("createProduct reports the wire name of any field the cloud refused", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "something_new" }] }),
  );

  expect(await createProduct(createInput)).toEqual({
    kind: "validation_failed",
    field: "something_new",
  });
});

test("createProduct returns barcode_taken with the taken codes on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(409, { code: "barcode_taken", codes: ["7790987000015"] }),
  );

  expect(await createProduct(createInput)).toEqual({
    kind: "barcode_taken",
    codes: ["7790987000015"],
  });
});

test("createProduct posts a chosen brand", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { ...honey, brandId: "brand-1" }));
  const withBrand = { ...createInput, brandId: "brand-1" };

  await createProduct(withBrand);

  expect(fetch).toHaveBeenCalledWith(
    "/api/products",
    expect.objectContaining({ body: JSON.stringify(withBrand) }),
  );
});

test("createProduct returns brand_inactive on a 409 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "brand_inactive" }));

  expect(await createProduct(createInput)).toEqual({ kind: "brand_inactive" });
});

test("createProduct returns tag_inactive with the refused tag on a 409 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "tag_inactive", tagId: "tag-2" }));

  expect(await createProduct(createInput)).toEqual({ kind: "tag_inactive", tagId: "tag-2" });
});

test.each([{ code: "tag_inactive" }, { code: "tag_inactive", tagId: 2 }])(
  "createProduct fails on a tag_inactive 409 that does not name the tag: %o",
  async (body) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, body));

    expect(await createProduct(createInput)).toEqual({ kind: "failed" });
  },
);

test("createProduct returns category_not_leaf on a 409 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "category_not_leaf" }));

  expect(await createProduct(createInput)).toEqual({ kind: "category_not_leaf" });
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

test("editProduct puts the fields and version and returns ok on 200", async () => {
  const applied: ProductSummary = { ...honey, version: 2 };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, applied));

  const outcome = await editProduct("product-1", editInput);

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/products/product-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(editInput),
  });
});

test.each([
  "name",
  "categoryId",
  "saleUnit",
  "barcodes",
  "version",
  "netContent",
  "netContentQuantity",
] as const)("editProduct returns validation_failed on field %s for a 400", async (field) => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", message: "invalid", details: [{ field }] }),
  );

  expect(await editProduct("product-1", editInput)).toEqual({
    kind: "validation_failed",
    field,
  });
});

test("editProduct reports the wire name of any field the cloud refused", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "something_new" }] }),
  );

  expect(await editProduct("product-1", editInput)).toEqual({
    kind: "validation_failed",
    field: "something_new",
  });
});

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

test("editProduct puts the product's brand", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ...honey, brandId: "brand-1" }));
  const withBrand = { ...editInput, brandId: "brand-1" };

  await editProduct("product-1", withBrand);

  expect(fetch).toHaveBeenCalledWith(
    "/api/products/product-1",
    expect.objectContaining({ body: JSON.stringify(withBrand) }),
  );
});

test("editProduct returns brand_inactive on a 409 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "brand_inactive" }));

  expect(await editProduct("product-1", editInput)).toEqual({ kind: "brand_inactive" });
});

test("editProduct returns tag_inactive with the refused tag on a 409 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "tag_inactive", tagId: "tag-2" }));

  expect(await editProduct("product-1", editInput)).toEqual({
    kind: "tag_inactive",
    tagId: "tag-2",
  });
});

test.each([{ code: "tag_inactive" }, { code: "tag_inactive", tagId: 2 }])(
  "editProduct fails on a tag_inactive 409 that does not name the tag: %o",
  async (body) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, body));

    expect(await editProduct("product-1", editInput)).toEqual({ kind: "failed" });
  },
);

test("editProduct returns internal_barcode_on_product_with_barcodes on a 409 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(409, { code: "internal_barcode_on_product_with_barcodes" }),
  );

  expect(await editProduct("product-1", editInput)).toEqual({
    kind: "internal_barcode_on_product_with_barcodes",
  });
});

test("editProduct returns sale_unit_held_by_discount with the discount's name on a 409 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(409, { code: "sale_unit_held_by_discount", discountName: "3x2 Yerba" }),
  );

  expect(await editProduct("product-1", editInput)).toEqual({
    kind: "sale_unit_held_by_discount",
    discountName: "3x2 Yerba",
  });
});

test.each([
  { code: "sale_unit_held_by_discount" },
  { code: "sale_unit_held_by_discount", discountName: 2 },
])(
  "editProduct fails on a sale_unit_held_by_discount 409 that does not name the discount: %o",
  async (body) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, body));

    expect(await editProduct("product-1", editInput)).toEqual({ kind: "failed" });
  },
);

test("editProduct returns category_not_leaf on a 409 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "category_not_leaf" }));

  expect(await editProduct("product-1", editInput)).toEqual({ kind: "category_not_leaf" });
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

test("generateInternalBarcode posts the product's barcodes and returns the generated code on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { code: "2000000000015" }));

  const outcome = await generateInternalBarcode({ barcodes: [] });

  expect(outcome).toEqual({ kind: "ok", code: "2000000000015" });
  expect(fetch).toHaveBeenCalledWith("/api/internal-barcodes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ barcodes: [] }),
  });
});

test("generateInternalBarcode returns failed on a body carrying no code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}));

  expect(await generateInternalBarcode({ barcodes: [] })).toEqual({ kind: "failed" });
});

test("generateInternalBarcode returns failed on a code that is not an internal barcode", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { code: "7790987000015" }));

  expect(await generateInternalBarcode({ barcodes: [] })).toEqual({ kind: "failed" });
});

test("generateInternalBarcode returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await generateInternalBarcode({ barcodes: [] })).toEqual({ kind: "unauthenticated" });
});

test("generateInternalBarcode returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await generateInternalBarcode({ barcodes: [] })).toEqual({ kind: "forbidden" });
});

test("generateInternalBarcode returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "20" }));

  expect(await generateInternalBarcode({ barcodes: [] })).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 20,
  });
});

test("generateInternalBarcode returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await generateInternalBarcode({ barcodes: [] })).toEqual({ kind: "failed" });
});

const labelRequest = [{ productId: "product-1", count: 3 }];

test("printLabels posts the requested labels and returns the pdf blob on 200", async () => {
  const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });
  vi.mocked(fetch).mockResolvedValue(new Response(pdf, { status: 200 }));

  const outcome = await printLabels(labelRequest);

  expect(outcome.kind).toBe("ok");
  expect(outcome.kind === "ok" && outcome.blob).toBeInstanceOf(Blob);
  expect(fetch).toHaveBeenCalledWith("/api/label-sheets", {
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

test("deactivateProduct puts the deactivation with no body and returns ok on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

  const outcome = await deactivateProduct("product-1");

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/products/product-1/deactivation", { method: "PUT" });
});

test("deactivateProduct returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  expect(await deactivateProduct("product-1")).toEqual({ kind: "not_found" });
});

test("deactivateProduct returns already_changed on a 409 product_already_inactive", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "product_already_inactive" }));

  expect(await deactivateProduct("product-1")).toEqual({ kind: "already_changed" });
});

test("deactivateProduct returns failed on a 409 with an unknown code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "something_else" }));

  expect(await deactivateProduct("product-1")).toEqual({ kind: "failed" });
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

test("reactivateProduct deletes the deactivation with no body and returns ok on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

  const outcome = await reactivateProduct("product-1");

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/products/product-1/deactivation", {
    method: "DELETE",
  });
});

test("reactivateProduct returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  expect(await reactivateProduct("product-1")).toEqual({ kind: "not_found" });
});

test("reactivateProduct returns already_changed on a 409 product_already_active", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "product_already_active" }));

  expect(await reactivateProduct("product-1")).toEqual({ kind: "already_changed" });
});

test("reactivateProduct returns barcode_taken with the taken codes on a 409 barcode_taken", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(409, { code: "barcode_taken", codes: ["7790987000015"] }),
  );

  expect(await reactivateProduct("product-1")).toEqual({
    kind: "barcode_taken",
    codes: ["7790987000015"],
  });
});

test("reactivateProduct returns failed on a 409 with an unknown code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "something_else" }));

  expect(await reactivateProduct("product-1")).toEqual({ kind: "failed" });
});

test("reactivateProduct returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await reactivateProduct("product-1")).toEqual({ kind: "unauthenticated" });
});

test("reactivateProduct returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await reactivateProduct("product-1")).toEqual({ kind: "forbidden" });
});

test("reactivateProduct returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "40" }));

  expect(await reactivateProduct("product-1")).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 40,
  });
});

test("reactivateProduct returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await reactivateProduct("product-1")).toEqual({ kind: "failed" });
});

test("fetchProducts returns failed when a listed product does not have the expected shape", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [honey, { ...honey, saleUnit: "BOX" }]));

  expect(await fetchProducts()).toEqual({ kind: "failed" });
});

test("createProduct returns ok on 201 whatever the body says, since the product is already created", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { id: "product-1" }));

  expect(await createProduct(createInput)).toEqual({ kind: "ok" });
});

test("editProduct returns ok on 200 whatever the body says, since the change is already applied", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ...honey, barcodes: "7790987000015" }));

  expect(await editProduct("product-1", editInput)).toEqual({ kind: "ok" });
});

test("generateInternalBarcode returns failed when the body has no code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { code: 7790987000015 }));

  expect(await generateInternalBarcode({ barcodes: [] })).toEqual({ kind: "failed" });
});
