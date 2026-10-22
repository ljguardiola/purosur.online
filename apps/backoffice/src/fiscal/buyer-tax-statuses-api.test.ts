import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchBuyerTaxStatuses } from "./buyer-tax-statuses-api";

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const statuses = [
  { code: 5, description: "Consumidor Final" },
  { code: 1, description: "IVA Responsable Inscripto" },
];

test("fetchBuyerTaxStatuses returns the buyer tax statuses the cloud lists", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, statuses));

  expect(await fetchBuyerTaxStatuses()).toEqual({ kind: "ok", value: statuses });
  expect(fetch).toHaveBeenCalledWith("/api/registers/buyer-tax-statuses");
});

test.each([
  ["a body that is not a list", { code: 5 }],
  ["a status without its description", [{ code: 5 }]],
])("fetchBuyerTaxStatuses returns failed on 200 with %s", async (_name, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  expect(await fetchBuyerTaxStatuses()).toEqual({ kind: "failed" });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("fetchBuyerTaxStatuses maps %s", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchBuyerTaxStatuses()).toEqual(outcome);
});

test("fetchBuyerTaxStatuses returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(null, { status: 429, headers: { "Retry-After": "45" } }),
  );

  expect(await fetchBuyerTaxStatuses()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
});

test("fetchBuyerTaxStatuses returns failed when the network call throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));

  expect(await fetchBuyerTaxStatuses()).toEqual({ kind: "failed" });
});
