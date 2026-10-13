import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { fetchSalesByPaymentMethod } from "./payments-report-api";
import { weekPaymentsReport } from "./test-support/payments-report-fixtures";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("asks for no range and no register when none is chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(weekPaymentsReport)));

  expect(await fetchSalesByPaymentMethod({})).toEqual({ kind: "ok", value: weekPaymentsReport });
  expect(fetch).toHaveBeenCalledWith("/api/reports/sales-by-payment-method");
});

test("asks for the range and the register chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(weekPaymentsReport)));

  await fetchSalesByPaymentMethod({
    from: "2026-10-01",
    to: "2026-10-07",
    register_id: FRONT_REGISTER_ID,
  });

  expect(fetch).toHaveBeenCalledWith(
    `/api/reports/sales-by-payment-method?from=2026-10-01&to=2026-10-07&register_id=${FRONT_REGISTER_ID}`,
  );
});

test("treats a body that does not match the report as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ ...weekPaymentsReport, totals: { total: 1 } })),
  );

  expect(await fetchSalesByPaymentMethod({})).toEqual({ kind: "failed" });
});

test("answers a refusal as the cloud's outcome", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

  expect(await fetchSalesByPaymentMethod({})).toEqual({ kind: "unauthenticated" });
});
