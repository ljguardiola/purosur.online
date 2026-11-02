import { expect, test } from "vitest";
import { authorizerSummaryRows, cashierSummaryRows } from "./returns-person-summary";
import { returnsReport } from "./test-support/returns-fixtures";

test("labels each cashier of the summary and a cashier without a name Sin identificar", () => {
  expect(cashierSummaryRows(returnsReport).map(({ label }) => label)).toEqual([
    "Carla",
    "Dora",
    "Sin identificar",
  ]);
});

test("labels each authorizer of the summary and a missing one Sin autorización", () => {
  expect(authorizerSummaryRows(returnsReport).map(({ label }) => label)).toEqual([
    "Beto",
    "Sin autorización",
  ]);
});

test("keeps the counters of each person and gives each row its own id", () => {
  const rows = cashierSummaryRows(returnsReport);

  expect(rows[0]).toMatchObject({
    voids: 1,
    voided: 520_000,
    returns: 1,
    refunded: 345_000,
    refunded_lines: 2,
    exchanged_lines: 0,
    typed_returns: 1,
  });
  expect(new Set(rows.map(({ id }) => id)).size).toBe(rows.length);
});
