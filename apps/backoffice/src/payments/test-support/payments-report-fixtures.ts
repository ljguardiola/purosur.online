import type { SalesByPaymentMethodBody } from "@purosur/contracts";

export const weekPaymentsReport: SalesByPaymentMethodBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  methods: [
    { method: "TRANSFER", sales_count: 1, amount: 50_000 },
    { method: "CASH", sales_count: 3, amount: 900_000 },
    { method: "POINT", sales_count: 1, amount: 150_000 },
    { method: "QR", sales_count: 2, amount: 300_000 },
  ],
  totals: { sales_count: 6, total: 1_400_000, average_ticket: 233_333 },
};

export const todayPaymentsReport: SalesByPaymentMethodBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  methods: [],
  totals: { sales_count: 0, total: 0, average_ticket: null },
};
