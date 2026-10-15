import {
  type FiscalDocumentState,
  type FiscalDocumentType,
  IN_PROGRESS_FISCAL_DOCUMENT_STATES,
} from "../../fiscal/index.js";

export const SALES_HISTORY_PAGE_SIZE = 50;

export const SALE_STANDINGS = ["completed", "in_progress", "deferred", "voided"] as const;

export type SaleStanding = (typeof SALE_STANDINGS)[number];

export interface SaleFiscalDocument {
  state: FiscalDocumentState;
  documentType: FiscalDocumentType;
  pointOfSale: number;
  number: number;
}

export interface DeferredSaleRecord {
  satisfied: boolean;
}

export const PENDING_DEFERRED_SALE_RECORD = {
  satisfied: false,
} as const satisfies DeferredSaleRecord;

export function isDeferralPending(record: DeferredSaleRecord | null): boolean {
  return record !== null && record.satisfied === PENDING_DEFERRED_SALE_RECORD.satisfied;
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
  voided: boolean;
  deferred: boolean;
  documentBeingRequested: boolean;
}

export type SaleStandingDefinition = Pick<SaleStandingFacts, "voided"> &
  Partial<Pick<SaleStandingFacts, "deferred" | "documentBeingRequested">>;

export const SALE_STANDING_DEFINITIONS = {
  voided: { voided: true },
  deferred: { voided: false, deferred: true },
  in_progress: { voided: false, deferred: false, documentBeingRequested: true },
} as const satisfies Record<Exclude<SaleStanding, "completed">, SaleStandingDefinition>;

function isDefinedBy(definition: SaleStandingDefinition, facts: SaleStandingFacts): boolean {
  return (
    definition.voided === facts.voided &&
    (definition.deferred === undefined || definition.deferred === facts.deferred) &&
    (definition.documentBeingRequested === undefined ||
      definition.documentBeingRequested === facts.documentBeingRequested)
  );
}

export function saleStandingOf({
  voided,
  deferred,
  fiscalDocument,
}: SaleFiscalFacts & { voided: boolean }): SaleStanding {
  const facts: SaleStandingFacts = {
    voided,
    deferred,
    documentBeingRequested:
      fiscalDocument !== null && IN_PROGRESS_FISCAL_DOCUMENT_STATES.includes(fiscalDocument.state),
  };
  if (isDefinedBy(SALE_STANDING_DEFINITIONS.voided, facts)) {
    return "voided";
  }
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
