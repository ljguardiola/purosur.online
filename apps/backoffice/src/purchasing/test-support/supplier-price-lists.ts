import type { SupplierPriceListReview, SupplierPriceListSummary } from "@purosur/contracts";

export const READ_LIST: SupplierPriceListSummary = {
  id: "5b100000-0000-4000-8000-000000000001",
  supplier: { id: "5a900000-0000-4000-8000-000000000001", name: "Distribuidora Andina" },
  sourceKind: "PDF",
  fileName: "lista-septiembre-2026.pdf",
  listDate: "2026-09-25",
  rowCount: 14,
  unpricedRowCount: 2,
  state: "EXTRACTED",
  readFailure: null,
  uploadedAt: "2026-09-26T13:00:00.000Z",
  replaced: false,
};

export const REVIEWED_LIST: SupplierPriceListSummary = {
  ...READ_LIST,
  id: "5b100000-0000-4000-8000-000000000002",
  supplier: { id: "5a900000-0000-4000-8000-000000000002", name: "Granos del Valle" },
  fileName: "precios-granos.pdf",
  listDate: "2026-08-10",
  rowCount: 212,
  unpricedRowCount: 0,
  state: "REVIEWED",
};

export const READING_LIST: SupplierPriceListSummary = {
  ...READ_LIST,
  id: "5b100000-0000-4000-8000-000000000003",
  supplier: { id: "5a900000-0000-4000-8000-000000000003", name: "Cerealera del Norte" },
  fileName: "lista-cerealera.pdf",
  listDate: null,
  rowCount: 0,
  unpricedRowCount: 0,
  state: "READING",
};

export const FAILED_LIST: SupplierPriceListSummary = {
  ...READ_LIST,
  id: "5b100000-0000-4000-8000-000000000004",
  supplier: { id: "5a900000-0000-4000-8000-000000000004", name: "Molinos San Javier" },
  fileName: "precios-molino.pdf",
  listDate: null,
  rowCount: 0,
  unpricedRowCount: 0,
  state: "READ_FAILED",
  readFailure: "unreadable_document",
};

export const DISCARDED_LIST: SupplierPriceListSummary = {
  ...READ_LIST,
  id: "5b100000-0000-4000-8000-000000000005",
  fileName: "lista-vieja.pdf",
  state: "DISCARDED",
};

export const REPLACED_LIST: SupplierPriceListSummary = {
  ...REVIEWED_LIST,
  id: "5b100000-0000-4000-8000-000000000006",
  fileName: "precios-granos-julio.pdf",
  listDate: "2026-07-10",
  replaced: true,
};

type ReviewActions = SupplierPriceListReview["actions"];

export const EVERY_REVIEW_ACTION: ReviewActions = {
  changeRows: true,
  confirm: true,
  discard: true,
};

export const ONLY_DISCARD: ReviewActions = { changeRows: false, confirm: false, discard: true };

const NO_REVIEW_ACTION: ReviewActions = {
  changeRows: false,
  confirm: false,
  discard: false,
};

export function reviewOf(
  list: SupplierPriceListSummary,
  rows: SupplierPriceListReview["rows"],
  actions: ReviewActions = NO_REVIEW_ACTION,
  pricesIncludeVat: boolean | null = true,
): SupplierPriceListReview {
  return { list: { ...list, version: 3, pricesIncludeVat }, rows, actions };
}

export const EXTRACTED_ROWS: SupplierPriceListReview["rows"] = [
  {
    id: "5b200000-0000-4000-8000-000000000001",
    description: "Almendra pelada Nonpareil x 25 kg",
    code: "AL-25",
    presentation: "Bolsa 25 kg",
    priceCents: 25_450_000,
    page: 2,
  },
  {
    id: "5b200000-0000-4000-8000-000000000002",
    description: "Pasas de uva sultanitas x 10 kg",
    code: null,
    presentation: null,
    priceCents: null,
    page: null,
  },
  {
    id: "5b200000-0000-4000-8000-000000000003",
    description: "Nuez mariposa extra light x 10 kg",
    code: "NM-10",
    presentation: "Caja 10 kg",
    priceCents: 14_200_000,
    page: 3,
  },
];
