import type { ReturnsReportBody } from "@purosur/contracts";

const CASHIER_ID = "11111111-1111-4111-8111-111111111111";
const AUTHORIZER_ID = "22222222-2222-4222-8222-222222222222";
const REGISTER_ID = "33333333-3333-4333-8333-333333333333";

type ReturnRow = ReturnsReportBody["typed"]["rows"][number];

const typedWithInvoice: ReturnRow = {
  return_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  occurred_at: "2026-10-07T14:30:00.000Z",
  register: { id: REGISTER_ID, name: "Caja principal" },
  sale: {
    id: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1",
    operation_number: 12,
    invoice: { point_of_sale: 5, number: 41 },
  },
  cashier: { id: CASHIER_ID, name: "Carla" },
  authorizer: { id: AUTHORIZER_ID, name: "Beto" },
  lines: [
    {
      sale_line_id: "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1",
      product_name: "Yerba 1 kg",
      sale_unit: "UNIT",
      quantity: 2,
      reason: "defective",
      disposition: "discard",
      refunded: 240_000,
    },
    {
      sale_line_id: "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2",
      product_name: "Queso cremoso",
      sale_unit: "KG",
      quantity: 350,
      reason: "change_of_mind",
      disposition: "restock",
      refunded: 105_000,
    },
  ],
  refunded: 345_000,
};

const typedWithoutAuthorizer: ReturnRow = {
  return_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  occurred_at: "2026-10-06T15:45:00.000Z",
  register: { id: REGISTER_ID, name: "Caja principal" },
  sale: {
    id: "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1",
    operation_number: null,
    invoice: null,
  },
  cashier: { id: CASHIER_ID, name: null },
  authorizer: null,
  lines: [
    {
      sale_line_id: "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1",
      product_name: "Aceite 900 ml",
      sale_unit: "UNIT",
      quantity: 1,
      reason: "change_of_mind",
      disposition: "restock",
      refunded: 80_000,
    },
  ],
  refunded: 80_000,
};

const scanned: ReturnRow = {
  return_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  occurred_at: "2026-10-07T02:30:00.000Z",
  register: { id: REGISTER_ID, name: "Caja del fondo" },
  sale: {
    id: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1",
    operation_number: 9,
    invoice: null,
  },
  cashier: { id: CASHIER_ID, name: "Dora" },
  authorizer: null,
  lines: [
    {
      sale_line_id: "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1",
      product_name: "Azúcar 1 kg",
      sale_unit: "UNIT",
      quantity: 3,
      reason: "defective",
      disposition: "restock",
      refunded: 150_000,
    },
  ],
  refunded: 150_000,
};

export const returnsReport: ReturnsReportBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  typed: {
    rows: [typedWithInvoice, typedWithoutAuthorizer],
    totals: { returns: 2, refunded: 425_000 },
  },
  scanned: { rows: [scanned], totals: { returns: 1, refunded: 150_000 } },
};

export const noScannedReturnsReport: ReturnsReportBody = {
  ...returnsReport,
  scanned: { rows: [], totals: { returns: 0, refunded: 0 } },
};

export const noReturnsReport: ReturnsReportBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  typed: { rows: [], totals: { returns: 0, refunded: 0 } },
  scanned: { rows: [], totals: { returns: 0, refunded: 0 } },
};
