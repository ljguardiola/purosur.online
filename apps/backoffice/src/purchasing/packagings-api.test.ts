import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createPackaging,
  deactivatePackaging,
  editPackaging,
  fetchPackagings,
  reactivatePackaging,
} from "./packagings-api";
import { bolsaDeAvena, cajaDeMiel, packagingList } from "./test-support/packagings";

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
const creation = { productId: cajaDeMiel.productId, name: "Caja x 12", quantityPerPackage: 12_000 };
const edit = { name: "Caja x 24", quantityPerPackage: 24_000, version: 3 };

const refusals = [
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
] as const;

describe("fetchPackagings", () => {
  test("lists the packagings with the products one may be defined for on 200", async () => {
    const list = packagingList([cajaDeMiel, bolsaDeAvena]);
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, list));

    expect(await fetchPackagings()).toEqual({ kind: "ok", value: list });
    expect(fetch).toHaveBeenCalledWith("/api/purchase-packagings");
  });

  test("returns failed when the list does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { packagings: [cajaDeMiel] }));

    expect(await fetchPackagings()).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchPackagings()).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await fetchPackagings()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchPackagings()).toEqual({ kind: "failed" });
  });
});

describe("createPackaging", () => {
  test("posts the product, name and quantity and answers the created packaging on 201", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, cajaDeMiel));

    expect(await createPackaging(creation)).toEqual({ kind: "ok", packaging: cajaDeMiel });
    expect(fetch).toHaveBeenCalledWith("/api/purchase-packagings", {
      method: "POST",
      ...JSON_BODY,
      body: JSON.stringify(creation),
    });
  });

  test("returns failed when the created packaging does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { id: "x" }));

    expect(await createPackaging(creation)).toEqual({ kind: "failed" });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "quantityPerPackage" }] }),
    );

    expect(await createPackaging(creation)).toEqual({
      kind: "validation_failed",
      field: "quantityPerPackage",
    });
  });

  test("returns failed on a 400 that is not a validation failure", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "other" }));

    expect(await createPackaging(creation)).toEqual({ kind: "failed" });
  });

  test("returns product_not_found on a 404", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "product_not_found" }));

    expect(await createPackaging(creation)).toEqual({ kind: "product_not_found" });
  });

  test.each([
    ["packaging_name_taken", { kind: "name_taken" }],
    ["something_else", { kind: "failed" }],
  ])("answers a 409 with the code %s as %j", async (code, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code }));

    expect(await createPackaging(creation)).toEqual(outcome);
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await createPackaging(creation)).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "120" }));

    expect(await createPackaging(creation)).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 120,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await createPackaging(creation)).toEqual({ kind: "failed" });
  });
});

describe("editPackaging", () => {
  test("puts the name, quantity and version, and returns ok on 200 whatever the body says", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { unexpected: true }));

    expect(await editPackaging("packaging-1", edit)).toEqual({ kind: "ok" });
    expect(fetch).toHaveBeenCalledWith("/api/purchase-packagings/packaging-1", {
      method: "PUT",
      ...JSON_BODY,
      body: JSON.stringify(edit),
    });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "quantityPerPackage" }] }),
    );

    expect(await editPackaging("packaging-1", edit)).toEqual({
      kind: "validation_failed",
      field: "quantityPerPackage",
    });
  });

  test("returns not_found on a 404", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

    expect(await editPackaging("packaging-1", edit)).toEqual({ kind: "not_found" });
  });

  test.each([
    ["stale_version", { kind: "stale_version" }],
    ["packaging_name_taken", { kind: "name_taken" }],
    ["something_else", { kind: "failed" }],
  ])("answers a 409 with the code %s as %j", async (code, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code }));

    expect(await editPackaging("packaging-1", edit)).toEqual(outcome);
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await editPackaging("packaging-1", edit)).toEqual(outcome);
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await editPackaging("packaging-1", edit)).toEqual({ kind: "failed" });
  });
});

describe.each([
  ["deactivatePackaging", deactivatePackaging, "PUT", "packaging_already_inactive"],
  ["reactivatePackaging", reactivatePackaging, "DELETE", "packaging_already_active"],
] as const)("%s", (_name, change, method, alreadyChangedCode) => {
  test(`sends a ${method} to the packaging's deactivation and returns ok on 200`, async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

    expect(await change("packaging-1")).toEqual({ kind: "ok" });
    expect(fetch).toHaveBeenCalledWith("/api/purchase-packagings/packaging-1/deactivation", {
      method,
    });
  });

  test("returns not_found on a 404", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404));

    expect(await change("packaging-1")).toEqual({ kind: "not_found" });
  });

  test("returns already_changed on the 409 that says so, and failed on any other 409", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(409, { code: alreadyChangedCode }));
    expect(await change("packaging-1")).toEqual({ kind: "already_changed" });

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(409, { code: "other" }));
    expect(await change("packaging-1")).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await change("packaging-1")).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

    expect(await change("packaging-1")).toEqual({ kind: "rate_limited", retryAfterSeconds: 30 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await change("packaging-1")).toEqual({ kind: "failed" });
  });
});

describe("reactivatePackaging's own refusal", () => {
  test("returns sale_unit_changed on the 409 that says its product's sale unit changed", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "packaging_sale_unit_changed" }));

    expect(await reactivatePackaging("packaging-1")).toEqual({ kind: "sale_unit_changed" });
  });

  test("is not deactivatePackaging's, which reads that 409 as failed", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "packaging_sale_unit_changed" }));

    expect(await deactivatePackaging("packaging-1")).toEqual({ kind: "failed" });
  });
});
