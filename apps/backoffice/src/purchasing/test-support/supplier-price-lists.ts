import type { SupplierPriceListReview, SupplierPriceListSummary } from "@purosur/contracts";

export const READ_LIST: SupplierPriceListSummary = {
  id: "5b100000-0000-4000-8000-000000000001",
  supplier: { id: "5a900000-0000-4000-8000-000000000001", name: "Distribuidora Andina" },
  source: { kind: "PDF", fileName: "lista-septiembre-2026.pdf" },
  listDate: "2026-09-25",
  rowCount: 14,
  unpricedRowCount: 2,
  state: "EXTRACTED",
  readFailure: null,
  rereading: false,
  lastRereadFailure: null,
  uploadedAt: "2026-09-26T13:00:00.000Z",
  replaced: false,
};

export const REVIEWED_LIST: SupplierPriceListSummary = {
  ...READ_LIST,
  id: "5b100000-0000-4000-8000-000000000002",
  supplier: { id: "5a900000-0000-4000-8000-000000000002", name: "Granos del Valle" },
  source: { kind: "PDF", fileName: "precios-granos.pdf" },
  listDate: "2026-08-10",
  rowCount: 212,
  unpricedRowCount: 0,
  state: "REVIEWED",
};

export const READING_LIST: SupplierPriceListSummary = {
  ...READ_LIST,
  id: "5b100000-0000-4000-8000-000000000003",
  supplier: { id: "5a900000-0000-4000-8000-000000000003", name: "Cerealera del Norte" },
  source: { kind: "PDF", fileName: "lista-cerealera.pdf" },
  listDate: null,
  rowCount: 0,
  unpricedRowCount: 0,
  state: "READING",
};

export const FAILED_LIST: SupplierPriceListSummary = {
  ...READ_LIST,
  id: "5b100000-0000-4000-8000-000000000004",
  supplier: { id: "5a900000-0000-4000-8000-000000000004", name: "Molinos San Javier" },
  source: { kind: "PDF", fileName: "precios-molino.pdf" },
  listDate: null,
  rowCount: 0,
  unpricedRowCount: 0,
  state: "READ_FAILED",
  readFailure: "unreadable_document",
};

export const DISCARDED_LIST: SupplierPriceListSummary = {
  ...READ_LIST,
  id: "5b100000-0000-4000-8000-000000000005",
  source: { kind: "PDF", fileName: "lista-vieja.pdf" },
  state: "DISCARDED",
};

export const REPLACED_LIST: SupplierPriceListSummary = {
  ...REVIEWED_LIST,
  id: "5b100000-0000-4000-8000-000000000006",
  source: { kind: "PDF", fileName: "precios-granos-julio.pdf" },
  listDate: "2026-07-10",
  replaced: true,
};

export const WEB_PAGE_URL = "https://distribuidora-sur.example/precios";

export const WEB_LIST: SupplierPriceListSummary = {
  ...READ_LIST,
  id: "5b100000-0000-4000-8000-000000000007",
  supplier: { id: "5a900000-0000-4000-8000-000000000007", name: "Distribuidora del Sur" },
  source: { kind: "WEB_PAGE", url: WEB_PAGE_URL },
};

export const WEB_READING_LIST: SupplierPriceListSummary = {
  ...WEB_LIST,
  id: "5b100000-0000-4000-8000-000000000008",
  supplier: { id: "5a900000-0000-4000-8000-000000000008", name: "Frutos del Litoral" },
  listDate: null,
  rowCount: 0,
  unpricedRowCount: 0,
  state: "READING",
};

export const WEB_FAILED_LIST: SupplierPriceListSummary = {
  ...WEB_LIST,
  id: "5b100000-0000-4000-8000-000000000009",
  supplier: { id: "5a900000-0000-4000-8000-000000000009", name: "Almacén Patagonia" },
  listDate: null,
  rowCount: 0,
  unpricedRowCount: 0,
  state: "READ_FAILED",
  readFailure: "unreadable_document",
};

export const WEB_REREADING_LIST: SupplierPriceListSummary = {
  ...WEB_LIST,
  id: "5b100000-0000-4000-8000-00000000000a",
  supplier: { id: "5a900000-0000-4000-8000-00000000000a", name: "Verdulería Cuyo" },
  rereading: true,
};

export const WEB_REREAD_FAILED_LIST: SupplierPriceListSummary = {
  ...WEB_LIST,
  id: "5b100000-0000-4000-8000-00000000000b",
  supplier: { id: "5a900000-0000-4000-8000-00000000000b", name: "Mayorista Pampa" },
  lastRereadFailure: "unreadable_document",
};

type ReviewActions = SupplierPriceListReview["actions"];
type ReviewCounts = SupplierPriceListReview["counts"];

export const EVERY_REVIEW_ACTION: ReviewActions = {
  changeRows: true,
  confirm: true,
  discard: true,
  linkRows: true,
  markRowsReviewed: true,
};

export const ONLY_DISCARD: ReviewActions = {
  changeRows: false,
  confirm: false,
  discard: true,
  linkRows: false,
  markRowsReviewed: false,
};

const NO_REVIEW_ACTION: ReviewActions = {
  changeRows: false,
  confirm: false,
  discard: false,
  linkRows: false,
  markRowsReviewed: false,
};

const NO_COUNTS: ReviewCounts = { needingReview: 0, linkedAutomatically: 0 };

export function reviewOf(
  list: SupplierPriceListSummary,
  rows: SupplierPriceListReview["rows"],
  actions: ReviewActions = NO_REVIEW_ACTION,
  pricesIncludeVat: boolean | null = true,
  counts: ReviewCounts = NO_COUNTS,
): SupplierPriceListReview {
  return {
    list: { ...list, version: 3, pricesIncludeVat, requiresVatRate: false },
    rows,
    actions,
    counts,
  };
}

type ReviewRow = SupplierPriceListReview["rows"][number];

export function itemRow(index: number): ReviewRow {
  return {
    id: `5b200000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    description: `Ítem ${index + 1}`,
    code: null,
    presentation: null,
    priceCents: 1_000,
    page: null,
    barcode: null,
    link: null,
    status: "new",
    needsReview: true,
    previousPriceCents: null,
    mayCreateProduct: true,
    pricePerSaleUnit: null,
  };
}

export const ALMOND_LINK: NonNullable<ReviewRow["link"]> = {
  product: {
    id: "90d00000-0000-4000-8000-000000000003",
    name: "Almendras peladas",
    brandName: null,
    netContent: null,
    saleUnit: "KG",
  },
  packaging: {
    id: "9ac00000-0000-4000-8000-000000000010",
    name: "Bolsa de 25 kg",
    quantityPerPackage: 25_000,
    buyable: true,
  },
  vatRate: null,
};

export const EXTRACTED_ROWS: SupplierPriceListReview["rows"] = [
  {
    id: "5b200000-0000-4000-8000-000000000001",
    description: "Almendra pelada Nonpareil x 25 kg",
    code: "AL-25",
    presentation: "Bolsa 25 kg",
    priceCents: 25_450_000,
    page: 2,
    barcode: null,
    link: ALMOND_LINK,
    status: "price_changed",
    needsReview: true,
    previousPriceCents: 24_800_000,
    mayCreateProduct: false,
    pricePerSaleUnit: { numerator: "25450000", denominator: "25" },
  },
  {
    id: "5b200000-0000-4000-8000-000000000002",
    description: "Pasas de uva sultanitas x 10 kg",
    code: null,
    presentation: null,
    priceCents: null,
    page: null,
    barcode: null,
    link: null,
    status: "new",
    needsReview: true,
    previousPriceCents: null,
    mayCreateProduct: true,
    pricePerSaleUnit: null,
  },
  {
    id: "5b200000-0000-4000-8000-000000000003",
    description: "Nuez mariposa extra light x 10 kg",
    code: "NM-10",
    presentation: "Caja 10 kg",
    priceCents: 14_200_000,
    page: 3,
    barcode: "7790001000029",
    link: null,
    status: "new",
    needsReview: true,
    previousPriceCents: null,
    mayCreateProduct: true,
    pricePerSaleUnit: null,
  },
];

export const LINKED_ROW: ReviewRow = {
  id: "5b200000-0000-4000-8000-000000000004",
  description: "Castañas de cajú W320 x 11,34 kg",
  code: "CJ-11",
  presentation: "Caja 11,34 kg",
  priceCents: 19_845_000,
  page: 4,
  barcode: null,
  link: {
    product: {
      id: "90d00000-0000-4000-8000-000000000051",
      name: "Castañas de cajú",
      brandName: null,
      netContent: null,
      saleUnit: "KG",
    },
    packaging: {
      id: "9ac00000-0000-4000-8000-000000000051",
      name: "Caja de 11,34 kg",
      quantityPerPackage: 11_340,
      buyable: true,
    },
    vatRate: null,
  },
  status: "linked",
  needsReview: false,
  previousPriceCents: null,
  mayCreateProduct: false,
  pricePerSaleUnit: { numerator: "19845000000", denominator: "11340" },
};

export const REVIEWED_ROW: ReviewRow = {
  ...LINKED_ROW,
  id: "5b200000-0000-4000-8000-000000000005",
  description: "Mix tropical x 5 kg",
  code: "MT-5",
  status: "reviewed",
};
