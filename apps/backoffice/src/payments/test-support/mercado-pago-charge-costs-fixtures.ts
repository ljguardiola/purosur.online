import type { MercadoPagoChargeCostsBody } from "@purosur/contracts";

const FRONT_REGISTER_ID = "9a3e7c40-2b1d-4f6a-8c05-5d7e1a3b9c28";
const BACK_REGISTER_ID = "3d5f8a12-6b4c-4e97-a0d3-7c2e9b1f4a56";

const NO_FIGURES = {
  gross_amount: 0,
  fee_amount: 0,
  financing_fee_amount: 0,
  taxes_amount: 0,
  net_amount: 0,
};

const QR_FIGURES = {
  gross_amount: 100_000,
  fee_amount: -3_990,
  financing_fee_amount: -1_000,
  taxes_amount: -838,
  net_amount: 94_172,
};

const OTHER_FIGURES = {
  gross_amount: 20_000,
  fee_amount: -800,
  financing_fee_amount: -200,
  taxes_amount: -168,
  net_amount: 18_832,
};

const ALL_FIGURES = {
  gross_amount: 120_000,
  fee_amount: -4_790,
  financing_fee_amount: -1_200,
  taxes_amount: -1_006,
  net_amount: 113_004,
};

export const weekChargeCosts: MercadoPagoChargeCostsBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  charges: [
    {
      payment_transaction_id: "5b8d2f61-7c3a-4e09-9f14-0a6c8e2d4b73",
      sale_id: "c4e1a972-3d58-4b6f-8a20-9e7f1b5d3c84",
      method: "QR",
      register_id: FRONT_REGISTER_ID,
      register_name: "Caja 1",
      amount: 100_000,
      charged_at: "2026-10-03T17:30:00.000Z",
      cost: { ...QR_FIGURES, money_release_date: "2026-10-17T15:00:00.000Z" },
    },
    {
      payment_transaction_id: "e7a30c95-1f42-4d86-b5e8-2c9d6a0f8137",
      sale_id: "1f9b6d34-8a27-4c50-93e1-6d4a2b8c7e05",
      method: "POINT",
      register_id: BACK_REGISTER_ID,
      register_name: "Caja 2",
      amount: 50_000,
      charged_at: "2026-10-04T12:05:00.000Z",
      cost: null,
    },
  ],
  days: [
    { day: "2026-10-03", charges_count: 2, pending_count: 0, ...ALL_FIGURES },
    { day: "2026-10-04", charges_count: 1, pending_count: 1, ...NO_FIGURES },
  ],
  months: [{ month: "2026-10", charges_count: 3, pending_count: 1, ...ALL_FIGURES }],
  methods: [
    { method: "QR", charges_count: 1, pending_count: 0, ...QR_FIGURES },
    { method: "POINT", charges_count: 1, pending_count: 1, ...NO_FIGURES },
    { method: "OTHER", charges_count: 1, pending_count: 0, ...OTHER_FIGURES },
  ],
  registers: [
    {
      register_id: FRONT_REGISTER_ID,
      register_name: "Caja 1",
      charges_count: 1,
      pending_count: 0,
      ...QR_FIGURES,
    },
    {
      register_id: BACK_REGISTER_ID,
      register_name: "Caja 2",
      charges_count: 1,
      pending_count: 1,
      ...NO_FIGURES,
    },
    {
      register_id: null,
      register_name: null,
      charges_count: 1,
      pending_count: 0,
      ...OTHER_FIGURES,
    },
  ],
  totals: { charges_count: 3, pending_count: 1, ...ALL_FIGURES },
};

export const emptyChargeCosts: MercadoPagoChargeCostsBody = {
  range: { from: "2026-10-01", to: "2026-10-31" },
  charges: [],
  days: [],
  months: [],
  methods: [],
  registers: [],
  totals: { charges_count: 0, pending_count: 0, ...NO_FIGURES },
};
