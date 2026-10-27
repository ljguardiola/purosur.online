import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { generateInternalBarcode } from "./internal-barcodes-api";

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

test("generateInternalBarcode returns failed when the body has no code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { code: 7790987000015 }));

  expect(await generateInternalBarcode({ barcodes: [] })).toEqual({ kind: "failed" });
});
