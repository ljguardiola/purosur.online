import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  fetchAssemblyBatches,
  fetchAssemblyBatchPreview,
  registerAssemblyBatch,
} from "./assembly-batches-api";
import { assemblyBatchList, mixBatch, mixPreview } from "./test-support/assembly-batches";
import { almendras, mixDeFrutosSecos, nueces } from "./test-support/recipes";

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

const refusals = [
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
] as const;

const body = {
  productId: mixDeFrutosSecos.productId,
  recipeVersion: 2,
  used: [{ componentProductId: almendras.id, quantity: 2_000 }],
  output: 4_950,
};

describe("fetchAssemblyBatches", () => {
  test("lists the batches of the period with the recipes on 200", async () => {
    const list = assemblyBatchList([mixBatch]);
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, list));

    expect(await fetchAssemblyBatches(30)).toEqual({ kind: "ok", value: list });
    expect(fetch).toHaveBeenCalledWith("/api/assembly-batches?days=30");
  });

  test("returns failed when the list does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { batches: [mixBatch] }));

    expect(await fetchAssemblyBatches(7)).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchAssemblyBatches(30)).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await fetchAssemblyBatches(30)).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchAssemblyBatches(30)).toEqual({ kind: "failed" });
  });
});

describe("fetchAssemblyBatchPreview", () => {
  test("asks for the proposal of a size with only the product and the size", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, mixPreview));

    expect(await fetchAssemblyBatchPreview({ productId: "p-1", size: 5_000 })).toEqual({
      kind: "ok",
      value: mixPreview,
    });
    expect(fetch).toHaveBeenCalledWith("/api/assembly-batches/preview?productId=p-1&size=5000");
  });

  test("sends each used quantity as its own entry and the typed output", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, mixPreview));

    await fetchAssemblyBatchPreview({
      productId: "p-1",
      size: 5_000,
      used: [
        { componentProductId: "c-1", quantity: 2_000 },
        { componentProductId: "c-2", quantity: 0 },
      ],
      output: 4_950,
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/assembly-batches/preview?productId=p-1&size=5000&used=c-1%3A2000&used=c-2%3A0&output=4950",
    );
  });

  test("returns failed when the preview does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { lot: null }));

    expect(await fetchAssemblyBatchPreview({ productId: "p-1", size: 5_000 })).toEqual({
      kind: "failed",
    });
  });

  test.each([...refusals, [409, { kind: "failed" }]] as const)(
    "answers a %i as %j",
    async (status, outcome) => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

      expect(await fetchAssemblyBatchPreview({ productId: "p-1", size: 5_000 })).toEqual(outcome);
    },
  );

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchAssemblyBatchPreview({ productId: "p-1", size: 5_000 })).toEqual({
      kind: "failed",
    });
  });
});

describe("registerAssemblyBatch", () => {
  test("posts the used quantities and the output and answers the registered batch on 200", async () => {
    const result = {
      batch: {
        id: mixBatch.id,
        productId: mixBatch.productId,
        assembledAt: mixBatch.assembledAt,
        output: 4_950,
        unitCostCents: 991_200,
        costIncomplete: false,
        expiresOn: "2026-11-02",
      },
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, result));

    expect(await registerAssemblyBatch(body)).toEqual({ kind: "ok", batch: result.batch });
    expect(fetch).toHaveBeenCalledWith("/api/assembly-batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  test("returns failed when the registered batch does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { batch: { id: "x" } }));

    expect(await registerAssemblyBatch(body)).toEqual({ kind: "failed" });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "output" }] }),
    );

    expect(await registerAssemblyBatch(body)).toEqual({
      kind: "validation_failed",
      field: "output",
    });
  });

  test.each([
    [404, "product_not_found"],
    [404, "no_recipe"],
    [409, "stale_recipe"],
    [400, "nothing_used"],
    [400, "invalid_output"],
  ] as const)("answers a %i refusal %s as that outcome", async (status, code) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status, { code, message: "refused" }));

    expect(await registerAssemblyBatch(body)).toEqual({ kind: code });
  });

  test("returns invalid_quantity with the component the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, {
        code: "invalid_quantity",
        message: "refused",
        componentProductId: nueces.id,
      }),
    );

    expect(await registerAssemblyBatch(body)).toEqual({
      kind: "invalid_quantity",
      componentProductId: nueces.id,
    });
  });

  test("returns component_not_found with the component the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, {
        code: "component_not_found",
        message: "refused",
        componentProductId: nueces.id,
      }),
    );

    expect(await registerAssemblyBatch(body)).toEqual({
      kind: "component_not_found",
      componentProductId: nueces.id,
    });
  });

  test("returns failed for an invalid size, which the body cannot carry", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "invalid_size", message: "refused" }),
    );

    expect(await registerAssemblyBatch(body)).toEqual({ kind: "failed" });
  });

  test("returns failed on a 400 whose body is no known refusal", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "other" }));

    expect(await registerAssemblyBatch(body)).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await registerAssemblyBatch(body)).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

    expect(await registerAssemblyBatch(body)).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 30,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await registerAssemblyBatch(body)).toEqual({ kind: "failed" });
  });
});
