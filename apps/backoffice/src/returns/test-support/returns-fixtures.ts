import type { ReturnsReportBody } from "@purosur/contracts";

const CASHIER_ID = "11111111-1111-4111-8111-111111111111";
const AUTHORIZER_ID = "22222222-2222-4222-8222-222222222222";
const NAMELESS_CASHIER_ID = "44444444-4444-4444-8444-444444444444";
const DORA_ID = "55555555-5555-4555-8555-555555555555";
const REGISTER_ID = "33333333-3333-4333-8333-333333333333";

type ReturnRow = ReturnsReportBody["typed"]["rows"][number];
type VoidRow = ReturnsReportBody["voids"]["rows"][number];

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
      resolution: "refund",
      refunded: 240_000,
    },
    {
      sale_line_id: "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2",
      product_name: "Queso cremoso",
      sale_unit: "KG",
      quantity: 350,
      reason: "change_of_mind",
      disposition: "restock",
      resolution: "refund",
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
  cashier: { id: NAMELESS_CASHIER_ID, name: null },
  authorizer: null,
  lines: [
    {
      sale_line_id: "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1",
      product_name: "Aceite 900 ml",
      sale_unit: "UNIT",
      quantity: 1,
      reason: "change_of_mind",
      disposition: "restock",
      resolution: "refund",
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
  cashier: { id: DORA_ID, name: "Dora" },
  authorizer: null,
  lines: [
    {
      sale_line_id: "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1",
      product_name: "Azúcar 1 kg",
      sale_unit: "UNIT",
      quantity: 3,
      reason: "defective",
      disposition: "restock",
      resolution: "refund",
      refunded: 150_000,
    },
    {
      sale_line_id: "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2",
      product_name: "Fideos 500 g",
      sale_unit: "UNIT",
      quantity: 1,
      reason: "change_of_mind",
      disposition: "restock",
      resolution: "exchange",
      refunded: 0,
    },
  ],
  refunded: 150_000,
};

const figures = {
  voids: 0,
  voided: 0,
  returns: 0,
  refunded: 0,
  refunded_lines: 0,
  exchanged_lines: 0,
  typed_returns: 0,
};

const voidedByCarla: VoidRow = {
  sale: {
    id: "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2",
    operation_number: 20,
    invoice: { point_of_sale: 5, number: 52 },
  },
  voided_at: "2026-10-05T13:15:00.000Z",
  register: { id: REGISTER_ID, name: "Caja principal" },
  cashier: { id: CASHIER_ID, name: "Carla" },
  authorizer: { id: AUTHORIZER_ID, name: "Beto" },
  total: 520_000,
};

const voidedWithoutAuthorizer: VoidRow = {
  sale: {
    id: "a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3",
    operation_number: null,
    invoice: null,
  },
  voided_at: "2026-10-04T16:00:00.000Z",
  register: { id: REGISTER_ID, name: "Caja del fondo" },
  cashier: { id: NAMELESS_CASHIER_ID, name: null },
  authorizer: null,
  total: 310_000,
};

export const returnsReport: ReturnsReportBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  typed: {
    rows: [typedWithInvoice, typedWithoutAuthorizer],
    totals: { returns: 2, refunded: 425_000 },
  },
  scanned: { rows: [scanned], totals: { returns: 1, refunded: 150_000 } },
  voids: {
    rows: [voidedByCarla, voidedWithoutAuthorizer],
    totals: { voids: 2, voided: 830_000 },
  },
  totals: {
    voids: 2,
    voided: 830_000,
    returns: 3,
    refunded: 575_000,
    refunded_lines: 4,
    exchanged_lines: 1,
    typed_returns: 2,
  },
  by_cashier: [
    {
      cashier: { id: CASHIER_ID, name: "Carla" },
      voids: 1,
      voided: 520_000,
      returns: 1,
      refunded: 345_000,
      refunded_lines: 2,
      exchanged_lines: 0,
      typed_returns: 1,
    },
    {
      cashier: { id: DORA_ID, name: "Dora" },
      ...figures,
      returns: 1,
      refunded: 150_000,
      refunded_lines: 1,
      exchanged_lines: 1,
    },
    {
      cashier: { id: NAMELESS_CASHIER_ID, name: null },
      ...figures,
      voids: 1,
      voided: 310_000,
      returns: 1,
      refunded: 80_000,
      refunded_lines: 1,
      typed_returns: 1,
    },
  ],
  by_authorizer: [
    {
      authorizer: { id: AUTHORIZER_ID, name: "Beto" },
      voids: 1,
      voided: 520_000,
      returns: 1,
      refunded: 345_000,
      refunded_lines: 2,
      exchanged_lines: 0,
      typed_returns: 1,
    },
    {
      authorizer: null,
      voids: 1,
      voided: 310_000,
      returns: 2,
      refunded: 230_000,
      refunded_lines: 2,
      exchanged_lines: 1,
      typed_returns: 1,
    },
  ],
};

export const noScannedReturnsReport: ReturnsReportBody = {
  ...returnsReport,
  scanned: { rows: [], totals: { returns: 0, refunded: 0 } },
};

export const noVoidsReport: ReturnsReportBody = {
  ...returnsReport,
  voids: { rows: [], totals: { voids: 0, voided: 0 } },
};

export const voidsOnlyReport: ReturnsReportBody = {
  ...returnsReport,
  typed: { rows: [], totals: { returns: 0, refunded: 0 } },
  scanned: { rows: [], totals: { returns: 0, refunded: 0 } },
};

export const noReturnsReport: ReturnsReportBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  typed: { rows: [], totals: { returns: 0, refunded: 0 } },
  scanned: { rows: [], totals: { returns: 0, refunded: 0 } },
  voids: { rows: [], totals: { voids: 0, voided: 0 } },
  totals: { ...figures },
  by_cashier: [],
  by_authorizer: [],
};

export const scannedReturnWithoutLinesReport: ReturnsReportBody = {
  ...noScannedReturnsReport,
  scanned: { rows: [{ ...scanned, lines: [] }], totals: { returns: 1, refunded: 150_000 } },
};
