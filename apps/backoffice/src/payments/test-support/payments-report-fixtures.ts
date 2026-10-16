import type { HandConfirmedPaymentsBody, SalesByPaymentMethodBody } from "@purosur/contracts";

export const weekPaymentsReport: SalesByPaymentMethodBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  methods: [
    { method: "TRANSFER", sales_count: 1, amount: 50_000 },
    { method: "CASH", sales_count: 4, amount: 900_000 },
    { method: "POINT", sales_count: 2, amount: 150_000 },
    { method: "QR", sales_count: 3, amount: 300_000 },
  ],
  totals: { sales_count: 6, total: 1_400_000, average_ticket: 233_333 },
};

export const todayPaymentsReport: SalesByPaymentMethodBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  methods: [],
  totals: { sales_count: 0, total: 0, average_ticket: null },
};

const ANA_ID = "9a3e7c40-2b1d-4f6a-8c05-5d7e1a3b9c28";
const UNKNOWN_CASHIER_ID = "3d5f8a12-6b4c-4e97-a0d3-7c2e9b1f4a56";

export const weekHandConfirmedReport: HandConfirmedPaymentsBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  totals: { count: 3, amount: 190_000 },
  methods: [
    { method: "TRANSFER", count: 2, amount: 150_000 },
    { method: "STANDALONE_TERMINAL", count: 1, amount: 40_000 },
  ],
  cashiers: [
    {
      cashier_id: ANA_ID,
      cashier_name: "Ana",
      count: 2,
      amount: 140_000,
      methods: [
        { method: "TRANSFER", count: 1, amount: 100_000 },
        { method: "STANDALONE_TERMINAL", count: 1, amount: 40_000 },
      ],
    },
    {
      cashier_id: UNKNOWN_CASHIER_ID,
      cashier_name: null,
      count: 1,
      amount: 50_000,
      methods: [
        { method: "TRANSFER", count: 1, amount: 50_000 },
        { method: "STANDALONE_TERMINAL", count: 0, amount: 0 },
      ],
    },
  ],
  payments: [
    {
      id: "6f1c2b7e-0a4d-4c55-8d21-3b9e5a7c1d02",
      method: "TRANSFER",
      amount: 100_000,
      confirmed_at: "2026-10-06T17:00:00.000Z",
      cashier_name: "Ana",
      confirmed_by_name: "Beto",
      sale_operation_number: 7,
    },
    {
      id: "2c8e4a90-5d17-4b3f-9e62-1a7d0c5b8f34",
      method: "TRANSFER",
      amount: 50_000,
      confirmed_at: "2026-10-06T15:30:00.000Z",
      cashier_name: null,
      confirmed_by_name: null,
      sale_operation_number: null,
    },
    {
      id: "8b4d6f21-3e9a-4c70-b158-6d2a0e7c9f13",
      method: "STANDALONE_TERMINAL",
      amount: 40_000,
      confirmed_at: "2026-10-05T12:05:00.000Z",
      cashier_name: "Ana",
      confirmed_by_name: "Beto",
      sale_operation_number: 9,
    },
  ],
};

export const emptyHandConfirmedReport: HandConfirmedPaymentsBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  totals: { count: 0, amount: 0 },
  methods: [
    { method: "TRANSFER", count: 0, amount: 0 },
    { method: "STANDALONE_TERMINAL", count: 0, amount: 0 },
  ],
  cashiers: [],
  payments: [],
};
