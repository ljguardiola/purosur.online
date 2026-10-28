import type { IssuedFiscalDocumentsReportBody } from "@purosur/contracts";

export const issuedFiscalDocumentsReport: IssuedFiscalDocumentsReportBody = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  rows: [
    {
      kind: "receipt",
      voucher_type: 11,
      point_of_sale: 5,
      authorization_kind: "cae",
      count: 12,
      amount: 1_500_000,
    },
    {
      kind: "receipt",
      voucher_type: 11,
      point_of_sale: 5,
      authorization_kind: "caea",
      count: 3,
      amount: 300_000,
    },
    {
      kind: "receipt",
      voucher_type: 11,
      point_of_sale: 7,
      authorization_kind: "cae",
      count: 2,
      amount: 200_000,
    },
    {
      kind: "credit_note",
      voucher_type: 13,
      point_of_sale: 5,
      authorization_kind: "cae",
      count: 1,
      amount: -50_000,
    },
  ],
  totals: {
    receipts: { count: 17, amount: 2_000_000 },
    credit_notes: { count: 1, amount: -50_000 },
    amount: 1_950_000,
    contingency: { count: 3, share_tenths_of_percent: 167 },
  },
};

export const noIssuedFiscalDocumentsReport: IssuedFiscalDocumentsReportBody = {
  range: { from: "2026-10-07", to: "2026-10-07" },
  rows: [],
  totals: {
    receipts: { count: 0, amount: 0 },
    credit_notes: { count: 0, amount: 0 },
    amount: 0,
    contingency: { count: 0, share_tenths_of_percent: null },
  },
};
