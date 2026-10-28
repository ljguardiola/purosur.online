import type { CashMovementsBody } from "@purosur/contracts";

type MovementRow = CashMovementsBody["movements"][number];

export const withdrawalFromFrontRegister: MovementRow = {
  id: "1b4e7a90-3c25-4d68-9f01-6a8c2e5d7b34",
  occurred_at: "2026-10-06T20:00:00.000Z",
  kind: "WITHDRAWAL",
  reason: "Retiro a caja fuerte",
  amount: 50_000,
  session_id: "6f1c2b7e-0a4d-4c55-8d21-3b9e5a7c1d02",
  register_name: "Caja principal",
  session_opened_at: "2026-10-06T11:00:00.000Z",
};

export const cashOutFromBackRegister: MovementRow = {
  id: "4d8a1c63-7e29-4b50-a3f7-0c5b9e2d6a18",
  occurred_at: "2026-10-06T14:30:00.000Z",
  kind: "CASH_OUT",
  reason: "Compra de hielo",
  amount: 12_550,
  session_id: "2c8e4a90-5d17-4b3f-9e62-1a7d0c5b8f34",
  register_name: "Caja del fondo",
  session_opened_at: "2026-10-06T12:00:00.000Z",
};

export const cashInFromFrontRegister: MovementRow = {
  id: "7e2b5d38-1a94-4c06-8b73-9d0f3a6c4e51",
  occurred_at: "2026-10-05T21:15:00.000Z",
  kind: "CASH_IN",
  reason: "Cambio para la caja",
  amount: 20_000,
  session_id: "8b4d6f21-3e9a-4c70-b158-6d2a0e7c9f13",
  register_name: "Caja principal",
  session_opened_at: "2026-10-05T11:00:00.000Z",
};

const earlierCashOut: MovementRow = {
  id: "9a6c3e07-5b18-4d42-b0e9-2f7a1c8d5b63",
  occurred_at: "2026-10-05T15:00:00.000Z",
  kind: "CASH_OUT",
  reason: "Bolsas de papel",
  amount: 3_000,
  session_id: "8b4d6f21-3e9a-4c70-b158-6d2a0e7c9f13",
  register_name: "Caja principal",
  session_opened_at: "2026-10-05T11:00:00.000Z",
};

export const weekCashMovementsReport: CashMovementsBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  totals: {
    cash_in: { movements: 1, amount: 20_000 },
    cash_out: { movements: 2, amount: 15_550 },
    withdrawal: { movements: 1, amount: 50_000 },
  },
  movements: [
    withdrawalFromFrontRegister,
    cashOutFromBackRegister,
    cashInFromFrontRegister,
    earlierCashOut,
  ],
};

export const emptyCashMovementsReport: CashMovementsBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  totals: {
    cash_in: { movements: 0, amount: 0 },
    cash_out: { movements: 0, amount: 0 },
    withdrawal: { movements: 0, amount: 0 },
  },
  movements: [],
};
