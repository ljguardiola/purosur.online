import type { CashSessionClosesBody } from "@purosur/contracts";
import { BACK_REGISTER_ID, FRONT_REGISTER_ID } from "../../shell/test-support/report-fixtures";

const TOMAS_ID = "9a3e7c40-2b1d-4f6a-8c05-5d7e1a3b9c28";
const LUCIA_ID = "3d5f8a12-6b4c-4e97-a0d3-7c2e9b1f4a56";
const ANA_ID = "5e7a9c13-4d2b-4f80-b6a1-8c3e0d2f7b94";
const BETO_ID = "7c1e3b25-9a4d-4e60-8f12-2b6d0a8c5e37";

export const closeByTomas: CashSessionClosesBody["sessions"][number] = {
  id: "6f1c2b7e-0a4d-4c55-8d21-3b9e5a7c1d02",
  closed_at: "2026-10-06T20:00:00.000Z",
  register_id: FRONT_REGISTER_ID,
  register_name: "Caja principal",
  cashier_id: TOMAS_ID,
  cashier_name: "Tomás Ruiz",
  closed_by_id: TOMAS_ID,
  closed_by_name: "Tomás Ruiz",
  expected_cash: 100_000,
  counted_cash: 50_000,
  difference: -50_000,
  has_difference: true,
};

const closeByLucia: CashSessionClosesBody["sessions"][number] = {
  id: "2c8e4a90-5d17-4b3f-9e62-1a7d0c5b8f34",
  closed_at: "2026-10-06T14:30:00.000Z",
  register_id: BACK_REGISTER_ID,
  register_name: "Caja del fondo",
  cashier_id: LUCIA_ID,
  cashier_name: "Lucía Pérez",
  closed_by_id: LUCIA_ID,
  closed_by_name: "Lucía Pérez",
  expected_cash: 80_000,
  counted_cash: 88_000,
  difference: 8_000,
  has_difference: true,
};

export const closeByAnaClosedByBeto: CashSessionClosesBody["sessions"][number] = {
  id: "8b4d6f21-3e9a-4c70-b158-6d2a0e7c9f13",
  closed_at: "2026-10-05T21:15:00.000Z",
  register_id: FRONT_REGISTER_ID,
  register_name: "Caja principal",
  cashier_id: ANA_ID,
  cashier_name: "Ana",
  closed_by_id: BETO_ID,
  closed_by_name: "Beto",
  expected_cash: 60_000,
  counted_cash: 60_000,
  difference: 0,
  has_difference: false,
};

export const weekCashSessionClosesReport: CashSessionClosesBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  totals: {
    sessions: 3,
    net_difference: -42_000,
    with_difference: 2,
    cashiers: [
      { cashier_id: TOMAS_ID, cashier_name: "Tomás Ruiz", sessions: 1 },
      { cashier_id: LUCIA_ID, cashier_name: "Lucía Pérez", sessions: 1 },
    ],
  },
  sessions: [closeByTomas, closeByLucia, closeByAnaClosedByBeto],
};

export const emptyCashSessionClosesReport: CashSessionClosesBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  totals: { sessions: 0, net_difference: 0, with_difference: 0, cashiers: [] },
  sessions: [],
};
