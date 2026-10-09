import {
  type FiscalDocumentState,
  type FiscalDocumentType,
  IN_PROGRESS_FISCAL_DOCUMENT_STATES,
} from "../../fiscal/index.js";

export const SALES_HISTORY_PAGE_SIZE = 50;

export const SALE_STANDINGS = ["completed", "in_progress", "deferred"] as const;

export type SaleStanding = (typeof SALE_STANDINGS)[number];

export interface SaleFiscalDocument {
  state: FiscalDocumentState;
  documentType: FiscalDocumentType;
  pointOfSale: number;
  number: number;
}

export interface SaleFiscalFacts {
  deferred: boolean;
  fiscalDocument: SaleFiscalDocument | null;
}

export type SaleComprobante =
  | {
      kind: "fiscal";
      documentType: FiscalDocumentType;
      pointOfSale: number;
      number: number;
    }
  | { kind: "deferred_non_fiscal" }
  | { kind: "none" };

export function saleStandingOf({ deferred, fiscalDocument }: SaleFiscalFacts): SaleStanding {
  if (deferred) {
    return "deferred";
  }
  return fiscalDocument !== null &&
    IN_PROGRESS_FISCAL_DOCUMENT_STATES.includes(fiscalDocument.state)
    ? "in_progress"
    : "completed";
}

export function saleComprobanteOf({ deferred, fiscalDocument }: SaleFiscalFacts): SaleComprobante {
  if (fiscalDocument?.state === "AUTHORIZED") {
    const { documentType, pointOfSale, number } = fiscalDocument;
    return { kind: "fiscal", documentType, pointOfSale, number };
  }
  return deferred ? { kind: "deferred_non_fiscal" } : { kind: "none" };
}
