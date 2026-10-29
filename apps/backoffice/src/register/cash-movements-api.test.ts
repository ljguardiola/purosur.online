import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { fetchCashMovements } from "./cash-movements-api";
import { weekCashMovementsReport } from "./test-support/cash-movements-fixtures";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("asks for no range and no register when none is chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(weekCashMovementsReport)));

  expect(await fetchCashMovements({})).toEqual({
    kind: "ok",
    value: weekCashMovementsReport,
  });
  expect(fetch).toHaveBeenCalledWith("/api/reports/cash-movements");
});

test("asks for the range and the register chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(weekCashMovementsReport)));

  await fetchCashMovements({
    from: "2026-10-01",
    to: "2026-10-07",
    register_id: FRONT_REGISTER_ID,
  });

  expect(fetch).toHaveBeenCalledWith(
    `/api/reports/cash-movements?from=2026-10-01&to=2026-10-07&register_id=${FRONT_REGISTER_ID}`,
  );
});

test("treats a body that does not match the report as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ ...weekCashMovementsReport, totals: { cash_in: 1 } })),
  );

  expect(await fetchCashMovements({})).toEqual({ kind: "failed" });
});

test("answers a refusal as the cloud's outcome", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));

  expect(await fetchCashMovements({})).toEqual({ kind: "forbidden" });
});
