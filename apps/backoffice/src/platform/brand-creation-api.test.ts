import type { BrandSummary } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createBrand } from "./brand-creation-api";

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

const granuz: BrandSummary = {
  id: "brand-1",
  name: "Granuz",
  active: true,
  version: 1,
  productCount: 42,
};

const JSON_BODY = { headers: { "Content-Type": "application/json" } };
const JSON_POST = { method: "POST", ...JSON_BODY };

describe("createBrand", () => {
  test("posts the name and answers the created brand on 201", async () => {
    const dulcor = { ...granuz, id: "brand-9", name: "Dulcor", productCount: 0 };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, dulcor));

    expect(await createBrand({ name: "Dulcor" })).toEqual({ kind: "ok", brand: dulcor });
    expect(fetch).toHaveBeenCalledWith("/api/brands", {
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

    expect(await createBrand({ name: "vitora" })).toEqual({ kind: "name_taken" });
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
