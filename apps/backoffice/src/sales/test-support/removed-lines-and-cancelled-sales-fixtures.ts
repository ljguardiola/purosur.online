import type { RemovedLinesAndCancelledSalesBody } from "@purosur/contracts";

const ANA_ID = "11111111-1111-4111-8111-111111111111";
const BETO_ID = "22222222-2222-4222-8222-222222222222";
const UNKNOWN_CASHIER_ID = "33333333-3333-4333-8333-333333333333";

export const removedLinesAndCancelledSalesReport: RemovedLinesAndCancelledSalesBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  cashiers: [
    {
      cashier_id: BETO_ID,
      name: "Beto",
      removed: { lines: 4, units: 7, thousandths: 1_250, amount: 1_500_000 },
      cancelled: { sales: 2, units: 5, thousandths: 0, amount: 820_050 },
    },
    {
      cashier_id: UNKNOWN_CASHIER_ID,
      name: null,
      removed: { lines: 1, units: 0, thousandths: 500, amount: 90_000 },
      cancelled: { sales: 0, units: 0, thousandths: 0, amount: 0 },
    },
    {
      cashier_id: ANA_ID,
      name: "Ana",
      removed: { lines: 0, units: 0, thousandths: 0, amount: 0 },
      cancelled: { sales: 1, units: 3, thousandths: 2_000, amount: 410_000 },
    },
  ],
  sessions: [
    {
      session_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      register_name: "Caja principal",
      opened_at: "2026-10-06T11:30:00.000Z",
      removed: { lines: 3, units: 6, thousandths: 0, amount: 1_100_000 },
      cancelled: { sales: 2, units: 5, thousandths: 0, amount: 820_050 },
    },
    {
      session_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      register_name: "Caja del fondo",
      opened_at: "2026-10-05T21:05:00.000Z",
      removed: { lines: 2, units: 1, thousandths: 1_750, amount: 490_000 },
      cancelled: { sales: 1, units: 3, thousandths: 2_000, amount: 410_000 },
    },
  ],
  totals: {
    removed: { lines: 5, units: 7, thousandths: 1_750, amount: 1_590_000 },
    cancelled: { sales: 3, units: 8, thousandths: 2_000, amount: 1_230_050 },
  },
};

export const nothingRemovedOrCancelledReport: RemovedLinesAndCancelledSalesBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  cashiers: [],
  sessions: [],
  totals: {
    removed: { lines: 0, units: 0, thousandths: 0, amount: 0 },
    cancelled: { sales: 0, units: 0, thousandths: 0, amount: 0 },
  },
};
