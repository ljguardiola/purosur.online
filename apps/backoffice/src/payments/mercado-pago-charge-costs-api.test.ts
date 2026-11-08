import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchMercadoPagoChargeCosts } from "./mercado-pago-charge-costs-api";
import { weekChargeCosts } from "./test-support/mercado-pago-charge-costs-fixtures";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("asks for the report without a range when none is chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(weekChargeCosts)));

  expect(await fetchMercadoPagoChargeCosts({})).toEqual({ kind: "ok", value: weekChargeCosts });
  expect(fetch).toHaveBeenCalledWith("/api/reports/mercado-pago-charge-costs");
});

test("asks for the range chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(weekChargeCosts)));

  await fetchMercadoPagoChargeCosts({ from: "2026-10-01", to: "2026-10-07" });

  expect(fetch).toHaveBeenCalledWith(
    "/api/reports/mercado-pago-charge-costs?from=2026-10-01&to=2026-10-07",
  );
});

test("treats a body that does not match the report's shape as a failed load", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ ...weekChargeCosts, totals: {} })),
  );

  expect(await fetchMercadoPagoChargeCosts({})).toEqual({ kind: "failed" });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("answers a %s as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status }));

  expect(await fetchMercadoPagoChargeCosts({})).toEqual(outcome);
});
