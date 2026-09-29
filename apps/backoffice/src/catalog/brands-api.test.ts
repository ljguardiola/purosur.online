import type { BrandSummary } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createBrand,
  deactivateBrand,
  editBrand,
  fetchBrands,
  reactivateBrand,
} from "./brands-api";

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

const granix: BrandSummary = {
  id: "brand-1",
  name: "Granix",
  active: true,
  version: 1,
  productCount: 42,
};
const litoral: BrandSummary = {
  id: "brand-2",
  name: "Yerba del Litoral",
  active: false,
  version: 3,
  productCount: 3,
};

const JSON_POST = { method: "POST", headers: { "Content-Type": "application/json" } };

describe("fetchBrands", () => {
  test("lists every brand on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [granix, litoral]));

    expect(await fetchBrands()).toEqual({ kind: "ok", value: [granix, litoral] });
    expect(fetch).toHaveBeenCalledWith("/brands");
  });

  test("returns failed when a listed brand does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [{ ...granix, productCount: "42" }]));

    expect(await fetchBrands()).toEqual({ kind: "failed" });
  });

  test.each([
    [401, { kind: "unauthenticated" }],
    [403, { kind: "forbidden" }],
    [500, { kind: "failed" }],
  ])("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchBrands()).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await fetchBrands()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchBrands()).toEqual({ kind: "failed" });
  });
});

describe("createBrand", () => {
  test("posts the name and answers the created brand on 201", async () => {
    const dulcor = { ...granix, id: "brand-9", name: "Dulcor", productCount: 0 };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, dulcor));

    expect(await createBrand({ name: "Dulcor" })).toEqual({ kind: "ok", brand: dulcor });
    expect(fetch).toHaveBeenCalledWith("/brands", {
      ...JSON_POST,
      body: JSON.stringify({ name: "Dulcor" }),
    });
  });

  test("returns failed when the created brand does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { id: "brand-9" }));

    expect(await createBrand({ name: "Dulcor" })).toEqual({ kind: "failed" });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "name" }] }),
    );

    expect(await createBrand({ name: "" })).toEqual({ kind: "validation_failed", field: "name" });
  });

  test("returns failed on a 400 that is not a validation failure", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "other" }));

    expect(await createBrand({ name: "Dulcor" })).toEqual({ kind: "failed" });
  });

  test("returns name_taken on a 409", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "brand_name_taken" }));

    expect(await createBrand({ name: "vitaco" })).toEqual({ kind: "name_taken" });
  });

  test.each([
    [401, { kind: "unauthenticated" }],
    [403, { kind: "forbidden" }],
    [500, { kind: "failed" }],
  ])("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await createBrand({ name: "Dulcor" })).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "120" }));

    expect(await createBrand({ name: "Dulcor" })).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 120,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await createBrand({ name: "Dulcor" })).toEqual({ kind: "failed" });
  });
});

describe("editBrand", () => {
  test("posts the name and version and returns ok on 200 whatever the body says", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { unexpected: true }));

    expect(await editBrand("brand-1", { name: "Granix Pro", version: 1 })).toEqual({ kind: "ok" });
    expect(fetch).toHaveBeenCalledWith("/brands/brand-1/edit", {
      ...JSON_POST,
      body: JSON.stringify({ name: "Granix Pro", version: 1 }),
    });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "version" }] }),
    );

    expect(await editBrand("brand-1", { name: "Granix", version: 1 })).toEqual({
      kind: "validation_failed",
      field: "version",
    });
  });

  test.each([
    [404, {}, { kind: "not_found" }],
    [409, { code: "stale_version" }, { kind: "stale_version" }],
    [409, { code: "brand_name_taken" }, { kind: "name_taken" }],
    [401, {}, { kind: "unauthenticated" }],
    [403, {}, { kind: "forbidden" }],
    [500, {}, { kind: "failed" }],
  ])("answers a %i carrying %j as %j", async (status, body, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status, body));

    expect(await editBrand("brand-1", { name: "Vitaco", version: 1 })).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await editBrand("brand-1", { name: "Granix", version: 1 })).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 45,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await editBrand("brand-1", { name: "Granix", version: 1 })).toEqual({
      kind: "failed",
    });
  });
});

describe.each([
  ["deactivateBrand", deactivateBrand, "deactivation", "brand_already_inactive"],
  ["reactivateBrand", reactivateBrand, "reactivation", "brand_already_active"],
] as const)("%s", (_name, change, path, alreadyCode) => {
  test(`posts to the brand's ${path} and returns ok on 200`, async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

    expect(await change("brand-1")).toEqual({ kind: "ok" });
    expect(fetch).toHaveBeenCalledWith(`/brands/brand-1/${path}`, {
      ...JSON_POST,
      body: JSON.stringify({}),
    });
  });

  test.each([
    [404, {}, { kind: "not_found" }],
    [409, { code: alreadyCode }, { kind: "already_changed" }],
    [409, { code: "other" }, { kind: "failed" }],
    [401, {}, { kind: "unauthenticated" }],
    [403, {}, { kind: "forbidden" }],
    [500, {}, { kind: "failed" }],
  ])("answers a %i carrying %j as %j", async (status, body, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status, body));

    expect(await change("brand-1")).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await change("brand-1")).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await change("brand-1")).toEqual({ kind: "failed" });
  });
});
