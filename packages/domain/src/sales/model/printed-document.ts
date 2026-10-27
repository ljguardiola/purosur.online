export const PRINTED_DOCUMENTS = ["sale_receipt", "credit_note", "deferred_invoice"] as const;

export type PrintedDocument = (typeof PRINTED_DOCUMENTS)[number];

export type PrintedDocumentKey =
  | { document: Exclude<PrintedDocument, "credit_note">; saleId: string }
  | { document: "credit_note"; saleId: string; creditNoteId: string };

export function isReprintedOnlyAsDuplicate(document: PrintedDocument): boolean {
  return document === "deferred_invoice";
}
