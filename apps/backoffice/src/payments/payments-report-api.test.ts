import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { fetchHandConfirmedPayments, fetchSalesByPaymentMethod } from "./payments-report-api";
import {
  weekHandConfirmedReport,
  weekPaymentsReport,
} from "./test-support/payments-report-fixtures";

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

describe("fetchHandConfirmedPayments", () => {
  test("asks for nothing when no filter is chosen", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(weekHandConfirmedReport)));

    expect(await fetchHandConfirmedPayments({})).toEqual({
      kind: "ok",
      value: weekHandConfirmedReport,
    });
    expect(fetch).toHaveBeenCalledWith("/api/reports/hand-confirmed-payments");
  });

  test("asks for the range, the register and the method chosen", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(weekHandConfirmedReport)));

    await fetchHandConfirmedPayments({
      from: "2026-10-01",
      to: "2026-10-07",
      register_id: FRONT_REGISTER_ID,
      method: "TRANSFER",
    });

    expect(fetch).toHaveBeenCalledWith(
      `/api/reports/hand-confirmed-payments?from=2026-10-01&to=2026-10-07&register_id=${FRONT_REGISTER_ID}&method=TRANSFER`,
    );
  });

  test("treats a body that does not match the report as failed", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ...weekHandConfirmedReport, totals: { count: 1 } })),
    );

    expect(await fetchHandConfirmedPayments({})).toEqual({ kind: "failed" });
  });

  test("answers a refusal as the cloud's outcome", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));

    expect(await fetchHandConfirmedPayments({})).toEqual({ kind: "forbidden" });
  });
});
