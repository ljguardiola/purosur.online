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

interface SaleStandingFacts {
  deferred: boolean;
  documentBeingRequested: boolean;
}

export type SaleStandingDefinition = Pick<SaleStandingFacts, "deferred"> &
  Partial<Pick<SaleStandingFacts, "documentBeingRequested">>;

export const SALE_STANDING_DEFINITIONS = {
  deferred: { deferred: true },
  in_progress: { deferred: false, documentBeingRequested: true },
} as const satisfies Record<Exclude<SaleStanding, "completed">, SaleStandingDefinition>;

function isDefinedBy(definition: SaleStandingDefinition, facts: SaleStandingFacts): boolean {
  return (
    definition.deferred === facts.deferred &&
    (definition.documentBeingRequested === undefined ||
      definition.documentBeingRequested === facts.documentBeingRequested)
  );
}

export function saleStandingOf({ deferred, fiscalDocument }: SaleFiscalFacts): SaleStanding {
  const facts: SaleStandingFacts = {
    deferred,
    documentBeingRequested:
      fiscalDocument !== null && IN_PROGRESS_FISCAL_DOCUMENT_STATES.includes(fiscalDocument.state),
  };
  if (isDefinedBy(SALE_STANDING_DEFINITIONS.deferred, facts)) {
    return "deferred";
  }
  return isDefinedBy(SALE_STANDING_DEFINITIONS.in_progress, facts) ? "in_progress" : "completed";
}

export function saleComprobanteOf({ deferred, fiscalDocument }: SaleFiscalFacts): SaleComprobante {
  if (fiscalDocument?.state === "AUTHORIZED") {
    const { documentType, pointOfSale, number } = fiscalDocument;
    return { kind: "fiscal", documentType, pointOfSale, number };
  }
  return deferred ? { kind: "deferred_non_fiscal" } : { kind: "none" };
}
