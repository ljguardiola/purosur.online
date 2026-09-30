import type { DiscountCreationBody, DiscountEditBody } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createDiscount,
  editDiscount,
  fetchDiscounts,
  fetchDiscountTargets,
} from "./discounts-api";
import { almacenTuesdays, discountList, yerbaOff } from "./test-support/discounts";

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

describe("fetchDiscounts", () => {
  test("lists every promotion on 200", async () => {
    const body = discountList([yerbaOff, almacenTuesdays]);
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

    expect(await fetchDiscounts()).toEqual({ kind: "ok", value: body });
    expect(fetch).toHaveBeenCalledWith("/api/discounts");
  });

  test("returns failed when a listed promotion does not have the expected shape", async () => {
    const body = { discounts: [{ ...yerbaOff, benefit: { kind: "PERCENT_OFF", percent: "15" } }] };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

    expect(await fetchDiscounts()).toEqual({ kind: "failed" });
  });

  test("returns failed when the body is not JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 200 }));

    expect(await fetchDiscounts()).toEqual({ kind: "failed" });
  });

  test.each([
    [401, { kind: "unauthenticated" }],
    [403, { kind: "forbidden" }],
    [500, { kind: "failed" }],
  ])("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchDiscounts()).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await fetchDiscounts()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchDiscounts()).toEqual({ kind: "failed" });
  });
});

describe("fetchDiscountTargets", () => {
  const targets = {
    products: [
      {
        id: "product-1",
        name: "Yerba Playadito 1 kg",
        saleUnit: "UNIT",
        brandName: null,
        netContent: null,
        barcodes: [],
      },
    ],
    categories: [{ id: "category-1", name: "Almacén", parentId: null }],
    tags: [{ id: "tag-1", name: "Sin TACC" }],
  };

  test("reads what a promotion can apply to on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, targets));

    expect(await fetchDiscountTargets()).toEqual({ kind: "ok", value: targets });
    expect(fetch).toHaveBeenCalledWith("/api/discount-targets");
  });

  test("returns failed when the body does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ...targets, tags: undefined }));

    expect(await fetchDiscountTargets()).toEqual({ kind: "failed" });
  });

  test("returns failed when the body is not JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 200 }));

    expect(await fetchDiscountTargets()).toEqual({ kind: "failed" });
  });

  test.each([
    [401, { kind: "unauthenticated" }],
    [403, { kind: "forbidden" }],
    [500, { kind: "failed" }],
  ])("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchDiscountTargets()).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await fetchDiscountTargets()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchDiscountTargets()).toEqual({ kind: "failed" });
  });
});

const JSON_POST = { method: "POST", headers: { "Content-Type": "application/json" } };

const creation: DiscountCreationBody = {
  name: "Yerba de septiembre",
  benefit: { kind: "PERCENT_OFF", percent: 15 },
  target: { kind: "PRODUCT", id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000101" },
  validFrom: "2026-09-12",
  validTo: "2026-09-30",
  weekdays: [1, 3],
};

describe("createDiscount", () => {
  test("posts the promotion and answers the created one on 201", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, yerbaOff));

    expect(await createDiscount(creation)).toEqual({ kind: "ok", discount: yerbaOff });
    expect(fetch).toHaveBeenCalledWith("/api/discounts", {
      ...JSON_POST,
      body: JSON.stringify(creation),
    });
  });

  test("returns failed when the created promotion does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { id: "discount-9" }));

    expect(await createDiscount(creation)).toEqual({ kind: "failed" });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "validTo" }] }),
    );

    expect(await createDiscount(creation)).toEqual({ kind: "validation_failed", field: "validTo" });
  });

  test("returns failed on a 400 that is not a validation failure", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "other" }));

    expect(await createDiscount(creation)).toEqual({ kind: "failed" });
  });

  test("returns target_not_found when the target is gone", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "discount_target_not_found" }));

    expect(await createDiscount(creation)).toEqual({ kind: "target_not_found" });
  });

  test("returns target_not_sold_by_unit when the product is sold by weight", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(409, { code: "discount_target_not_sold_by_unit" }),
    );

    expect(await createDiscount(creation)).toEqual({ kind: "target_not_sold_by_unit" });
  });

  test("returns failed on a 409 that names another code", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "other" }));

    expect(await createDiscount(creation)).toEqual({ kind: "failed" });
  });

  test.each([
    [401, { kind: "unauthenticated" }],
    [403, { kind: "forbidden" }],
    [500, { kind: "failed" }],
  ])("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await createDiscount(creation)).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

    expect(await createDiscount(creation)).toEqual({ kind: "rate_limited", retryAfterSeconds: 30 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await createDiscount(creation)).toEqual({ kind: "failed" });
  });
});

const edit: DiscountEditBody = { ...creation, version: 3, active: false };

describe("editDiscount", () => {
  test("puts the promotion with its version and switch, and answers the saved one on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, yerbaOff));

    expect(await editDiscount("discount-1", edit)).toEqual({ kind: "ok", discount: yerbaOff });
    expect(fetch).toHaveBeenCalledWith("/api/discounts/discount-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edit),
    });
  });

  test("returns failed when the saved promotion does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { id: "discount-1" }));

    expect(await editDiscount("discount-1", edit)).toEqual({ kind: "failed" });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "weekdays" }] }),
    );

    expect(await editDiscount("discount-1", edit)).toEqual({
      kind: "validation_failed",
      field: "weekdays",
    });
  });

  test("returns failed on a 400 that is not a validation failure", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "other" }));

    expect(await editDiscount("discount-1", edit)).toEqual({ kind: "failed" });
  });

  test("returns not_found when the promotion is gone", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

    expect(await editDiscount("discount-1", edit)).toEqual({ kind: "not_found" });
  });

  test("returns stale_version when the promotion changed since it was loaded", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "stale_version" }));

    expect(await editDiscount("discount-1", edit)).toEqual({ kind: "stale_version" });
  });

  test("returns target_not_found when the target is gone", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "discount_target_not_found" }));

    expect(await editDiscount("discount-1", edit)).toEqual({ kind: "target_not_found" });
  });

  test("returns target_not_sold_by_unit when the product is sold by weight", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(409, { code: "discount_target_not_sold_by_unit" }),
    );

    expect(await editDiscount("discount-1", edit)).toEqual({ kind: "target_not_sold_by_unit" });
  });

  test("returns product_sold_by_weight with the product's name when it is sold by weight", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(409, {
        code: "discount_product_sold_by_weight",
        productName: "Queso cremoso",
      }),
    );

    expect(await editDiscount("discount-1", edit)).toEqual({
      kind: "product_sold_by_weight",
      productName: "Queso cremoso",
    });
  });

  test.each([
    { code: "discount_product_sold_by_weight" },
    { code: "discount_product_sold_by_weight", productName: 2 },
  ])(
    "returns failed on a product_sold_by_weight 409 that does not name the product: %o",
    async (body) => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(409, body));

      expect(await editDiscount("discount-1", edit)).toEqual({ kind: "failed" });
    },
  );

  test("returns failed on a 409 that names another code", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "other" }));

    expect(await editDiscount("discount-1", edit)).toEqual({ kind: "failed" });
  });

  test.each([
    [401, { kind: "unauthenticated" }],
    [403, { kind: "forbidden" }],
    [500, { kind: "failed" }],
  ])("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await editDiscount("discount-1", edit)).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

    expect(await editDiscount("discount-1", edit)).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 30,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await editDiscount("discount-1", edit)).toEqual({ kind: "failed" });
  });
});
