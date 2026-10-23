import type { AlertLevel } from "../../alerts/index.js";
import type { TaxAuthorityRejection } from "../model/fiscal-rejection-standing.js";
import type { ExternalInvoicingVoucher, FiscalTaskDocumentType } from "../model/fiscal-task.js";

export interface FiscalTaskAlert {
  level: AlertLevel;
  escalatedAt: Date | null;
}

interface OpenFiscalTaskBase {
  id: string;
  registerId: string;
  registerName: string;
  createdAt: Date;
  alert: FiscalTaskAlert | null;
}

export type OpenFiscalTask =
  | (OpenFiscalTaskBase & {
      kind: "external_invoicing";
      pointOfSale: number;
      documentType: FiscalTaskDocumentType;
      number: number;
      voucher: ExternalInvoicingVoucher;
    })
  | (OpenFiscalTaskBase & {
      kind: "credit_note_rejected";
      pointOfSale: number;
      number: number;
      creditNoteId: string;
      rejections: TaxAuthorityRejection[];
    })
  | (OpenFiscalTaskBase & {
      kind: "deferred_sale_expired";
      saleOccurredAt: Date;
      total: number;
      shortCode: string;
    });

export interface OpenFiscalTaskReader {
  openTasksOfBranch(locationId: string): Promise<OpenFiscalTask[]>;
}
