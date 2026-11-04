import type { ReceiptDifferencesBody } from "@purosur/contracts";

const ANDINA_ID = "90e00000-0000-4000-8000-0000000000a1";
const GRANOS_ID = "90e00000-0000-4000-8000-0000000000a2";

export const receiptDifferencesReport: ReceiptDifferencesBody = {
  range: { from: "2026-09-01", to: "2026-11-04" },
  suppliers: [
    {
      supplier_id: ANDINA_ID,
      name: "Distribuidora Andina",
      short_lines: 2,
      price_difference_lines: 1,
      price_difference_cents: 15_000,
      months: [
        {
          month: "2026-10",
          short_lines: 2,
          price_difference_lines: 1,
          price_difference_cents: 15_000,
          lines: [
            {
              receipt_id: "90e00000-0000-4000-8000-0000000000c1",
              order_id: "90e00000-0000-4000-8000-0000000000b1",
              received_on: "2026-10-07",
              product: {
                id: "90d00000-0000-4000-8000-000000000001",
                name: "Miel pura de abeja 1 kg",
                brandName: null,
                netContent: null,
                saleUnit: "UNIT",
              },
              received_quantity: 8_000,
              missing_quantity: 2_000,
              price_difference_cents: 15_000,
            },
            {
              receipt_id: "90e00000-0000-4000-8000-0000000000c2",
              order_id: "90e00000-0000-4000-8000-0000000000b1",
              received_on: "2026-10-21",
              product: {
                id: "90d00000-0000-4000-8000-000000000002",
                name: "Avena arrollada",
                brandName: null,
                netContent: null,
                saleUnit: "KG",
              },
              received_quantity: 5_000,
              missing_quantity: 2_500,
              price_difference_cents: null,
            },
          ],
        },
      ],
    },
    {
      supplier_id: GRANOS_ID,
      name: "Granos del Sur",
      short_lines: 0,
      price_difference_lines: 1,
      price_difference_cents: -4_500,
      months: [
        {
          month: "2026-09",
          short_lines: 0,
          price_difference_lines: 1,
          price_difference_cents: -4_500,
          lines: [
            {
              receipt_id: "90e00000-0000-4000-8000-0000000000c3",
              order_id: "90e00000-0000-4000-8000-0000000000b2",
              received_on: "2026-09-30",
              product: {
                id: "90d00000-0000-4000-8000-000000000004",
                name: "Aceite de Almendras",
                brandName: "Vitora",
                netContent: { quantity: 30, unit: "ML" },
                saleUnit: "UNIT",
              },
              received_quantity: 3_000,
              missing_quantity: 0,
              price_difference_cents: -4_500,
            },
          ],
        },
      ],
    },
  ],
  totals: {
    suppliers: 2,
    short_lines: 2,
    price_difference_lines: 2,
    price_difference_cents: 10_500,
  },
};

export const emptyReceiptDifferencesReport: ReceiptDifferencesBody = {
  range: { from: "2026-09-01", to: "2026-11-04" },
  suppliers: [],
  totals: { suppliers: 0, short_lines: 0, price_difference_lines: 0, price_difference_cents: 0 },
};
