import type { RealTimeAuthorizationAnswer, RejectionClass } from "./real-time-authorization.js";

export const FACTURA_C_DOCUMENT_TYPE = "factura_c";

export type FiscalDocumentType = typeof FACTURA_C_DOCUMENT_TYPE;

export interface TaxAuthorityRejection {
  code: number;
  message: string;
}

interface RejectionAlertSubject {
  pointOfSale: number;
  documentType: FiscalDocumentType;
  fiscalDocumentId: string;
  saleId: string;
}

export type RejectionAlertChange =
  | {
      kind: "open";
      pointOfSale: number;
      documentType: FiscalDocumentType;
      rejectionClass: RejectionClass;
      fiscalDocumentId: string;
      saleId: string;
      rejections: readonly TaxAuthorityRejection[];
    }
  | { kind: "clear"; pointOfSale: number; documentType: FiscalDocumentType };

export function rejectionAlertChange(
  answer: RealTimeAuthorizationAnswer,
  rejections: readonly TaxAuthorityRejection[],
  { pointOfSale, documentType, fiscalDocumentId, saleId }: RejectionAlertSubject,
): RejectionAlertChange | null {
  switch (answer.kind) {
    case "rejected":
      return {
        kind: "open",
        pointOfSale,
        documentType,
        rejectionClass: answer.rejectionClass,
        fiscalDocumentId,
        saleId,
        rejections,
      };
    case "authorized":
      return { kind: "clear", pointOfSale, documentType };
    case "not_attempted":
    case "unclear":
      return null;
  }
}
