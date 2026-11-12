import type { SaleDetail } from "../../shell/sale-receipt-text";

export const DETAIL: SaleDetail = {
  sale_id: "sale-1",
  occurred_at: "2026-10-09T11:42:00.000-03:00",
  total: 5_070_000,
  comprobante: {
    kind: "fiscal",
    document_type: "factura_c",
    authorization: "real_time",
    point_of_sale: 3,
    number: 1248,
  },
  operation_number: 482,
  served_by_first_name: "Tomás",
  line_count: 8,
  lines: [
    { product_name: "Almendras peladas", sale_unit: "KG", quantity: 325, line_total: 614_250 },
  ],
  cash_rounding: 0,
  payments: [{ method: "CASH", card_type: null, amount: 5_070_000 }],
  state: "completed",
  voidability: {
    kind: "voidable",
    refunds: [
      {
        method: "CASH",
        card_type: null,
        amount: 5_070_000,
        state: "APPROVED",
        sent_by_cloud: false,
      },
    ],
    credit_note_corrects: { point_of_sale: 3, number: 1248 },
  },
  void_authorization_required: false,
  reprint_authorization_required: false,
  reprint: { kind: "available" },
  next_copy: { kind: "duplicate", order_number: 1 },
  credit_notes: [],
  deferred_invoice_next_copy: null,
  short_code: null,
};
