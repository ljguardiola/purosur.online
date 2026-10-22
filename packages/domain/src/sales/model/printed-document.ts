export const PRINTED_DOCUMENTS = ["sale_receipt", "credit_note", "deferred_invoice"] as const;

export type PrintedDocument = (typeof PRINTED_DOCUMENTS)[number];

export interface PrintedDocumentKey {
  document: PrintedDocument;
  saleId: string;
}
