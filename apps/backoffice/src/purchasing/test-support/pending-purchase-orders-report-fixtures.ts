import type { PendingPurchaseOrdersBody } from "@purosur/contracts";

export const pendingPurchaseOrdersReport: PendingPurchaseOrdersBody = {
  range: { from: "2026-10-05", to: "2026-11-04" },
  orders: [
    {
      id: "90e00000-0000-4000-8000-0000000000b1",
      supplier: { id: "90e00000-0000-4000-8000-0000000000a1", name: "Distribuidora Andina" },
      state: "SENT",
      sent_at: "2026-10-08T01:30:00.000Z",
      line_count: 2,
      expected_total_cents: 555_000,
      has_unpriced_line: true,
    },
    {
      id: "90e00000-0000-4000-8000-0000000000b2",
      supplier: { id: "90e00000-0000-4000-8000-0000000000a2", name: "Granos del Sur" },
      state: "PARTIALLY_RECEIVED",
      sent_at: "2026-10-20T15:00:00.000Z",
      line_count: 1_200,
      expected_total_cents: 120_050,
      has_unpriced_line: false,
    },
    {
      id: "90e00000-0000-4000-8000-0000000000b3",
      supplier: { id: "90e00000-0000-4000-8000-0000000000a1", name: "Distribuidora Andina" },
      state: "SENT",
      sent_at: "2026-10-27T12:00:00.000Z",
      line_count: 3,
      expected_total_cents: 80_000,
      has_unpriced_line: false,
    },
  ],
  totals: { orders: 3, suppliers: 2, expected_total_cents: 755_050, has_unpriced_line: true },
};

export const emptyPendingPurchaseOrdersReport: PendingPurchaseOrdersBody = {
  range: { from: "2026-10-05", to: "2026-11-04" },
  orders: [],
  totals: { orders: 0, suppliers: 0, expected_total_cents: 0, has_unpriced_line: false },
};
