import type { IssuedFiscalDocumentDetailBody, IssuedFiscalDocumentsBody } from "@purosur/contracts";
import { BACK_REGISTER_ID, FRONT_REGISTER_ID } from "../../shell/test-support/report-fixtures";

type IssuedFiscalDocument = IssuedFiscalDocumentsBody["documents"][number];

export const authorizedReceipt: IssuedFiscalDocument = {
  kind: "receipt",
  voucher_type: 11,
  point_of_sale: 3,
  number: 1247,
  issued_on: "2026-09-12",
  issued_at: "2026-09-12T15:04:00.000Z",
  register: { id: FRONT_REGISTER_ID, name: "Caja principal" },
  authorization: { kind: "cae", code: "75123456789012", due_on: "2026-09-26" },
  state: "authorized",
  contingency: false,
  total: 1750275,
  corrected_voucher: null,
};

export const creditNote: IssuedFiscalDocument = {
  kind: "credit_note",
  voucher_type: 13,
  point_of_sale: 3,
  number: 41,
  issued_on: "2026-09-12",
  issued_at: "2026-09-12T18:30:00.000Z",
  register: { id: FRONT_REGISTER_ID, name: "Caja principal" },
  authorization: { kind: "cae", code: "75123456789055", due_on: "2026-09-26" },
  state: "authorized",
  contingency: false,
  total: 320000,
  corrected_voucher: { voucher_type: 11, point_of_sale: 3, number: 1246 },
};

export const contingencyReceipt: IssuedFiscalDocument = {
  kind: "receipt",
  voucher_type: 11,
  point_of_sale: 7,
  number: 88,
  issued_on: "2026-09-18",
  issued_at: "2026-09-18T14:15:00.000Z",
  register: { id: BACK_REGISTER_ID, name: "Caja del fondo" },
  authorization: {
    kind: "caea",
    code: "36251478963214",
    fortnight_start: "2026-09-16",
    fortnight_end: "2026-09-30",
  },
  state: "authorized",
  contingency: true,
  total: 98050,
  corrected_voucher: null,
};

export const unauthorizedReceipt: IssuedFiscalDocument = {
  kind: "receipt",
  voucher_type: 11,
  point_of_sale: 3,
  number: 1248,
  issued_on: "2026-09-12",
  issued_at: "2026-09-12T19:45:00.000Z",
  register: { id: FRONT_REGISTER_ID, name: "Caja principal" },
  authorization: null,
  state: "awaiting_authorization",
  contingency: false,
  total: 45000,
  corrected_voucher: null,
};

export const issuedFiscalDocuments: IssuedFiscalDocumentsBody = {
  range: { from: "2026-09-01", to: "2026-09-30" },
  documents: [authorizedReceipt, creditNote, contingencyReceipt, unauthorizedReceipt],
  total: 4,
  page_size: 25,
};

export const noIssuedFiscalDocuments: IssuedFiscalDocumentsBody = {
  range: { from: "2026-09-01", to: "2026-09-30" },
  documents: [],
  total: 0,
  page_size: 25,
};

export const pagedIssuedFiscalDocuments: IssuedFiscalDocumentsBody = {
  range: { from: "2026-09-01", to: "2026-09-30" },
  documents: [authorizedReceipt, creditNote],
  total: 131,
  page_size: 25,
};

const creditNoteAgainstReceipt: IssuedFiscalDocument = {
  ...creditNote,
  corrected_voucher: { voucher_type: 11, point_of_sale: 3, number: 1247 },
};

export const authorizedReceiptDetail: IssuedFiscalDocumentDetailBody = {
  ...authorizedReceipt,
  buyer: { kind: "final_consumer" },
  lines: [
    {
      product_name: "Yerba 1 kg",
      sale_unit: "UNIT",
      quantity: 2,
      promotion: null,
      amount: 850000,
    },
    {
      product_name: "Queso cremoso",
      sale_unit: "KG",
      quantity: 450,
      promotion: { name: "Lácteos 2x1" },
      amount: 900275,
    },
  ],
  payments: [{ method: "CASH", card_type: null, amount: 1750275 }],
  credit_notes: [],
};

export const receiptDetailWithCreditNote: IssuedFiscalDocumentDetailBody = {
  ...authorizedReceiptDetail,
  credit_notes: [creditNoteAgainstReceipt],
};

export const creditNoteDetail: IssuedFiscalDocumentDetailBody = {
  ...creditNote,
  buyer: { kind: "final_consumer" },
  lines: [
    {
      product_name: "Yerba 1 kg",
      sale_unit: "UNIT",
      quantity: 1,
      promotion: null,
      amount: 320000,
    },
  ],
  payments: [{ method: "POINT", card_type: "DEBIT", amount: 320000 }],
  credit_notes: [],
};
