import type { FiscalDocumentType } from "../model/fiscal-rejection-standing.js";
import { fortnightContaining } from "../model/offline-authorization-code.js";
import {
  awaitsRemedy,
  correctionAfter,
  correctionChanges,
  type DocumentFieldChange,
  type OfflineDocumentCorrectionRefusal,
  offlineDocumentCorrectionRefusal,
  presentedOfflineDocument,
  type RejectedDocumentRemedy,
  remedyAwaitsResend,
} from "../model/rejected-document-remedy.js";
import type { RemedyRejectedDocumentPorts } from "./remedy-rejected-document-ports.js";

export interface RemedyRejectedDocumentInput {
  locationId: string;
  pointOfSaleNumber: number;
  fortnightStart: string;
  documentType: FiscalDocumentType;
  number: number;
  remedy: RejectedDocumentRemedy;
  actorId: string;
}

export type RemedyRejectedDocumentOutcome =
  | { kind: "not_rejected" }
  | { kind: "already_remedied" }
  | { kind: "document_not_found" }
  | { kind: "correction_refused"; refusal: OfflineDocumentCorrectionRefusal }
  | { kind: "remedied"; recordedAt: Date; changes: DocumentFieldChange[] };

export function remedyRejectedDocument(
  { store, clock }: RemedyRejectedDocumentPorts,
  {
    locationId,
    pointOfSaleNumber,
    fortnightStart,
    documentType,
    number,
    remedy,
    actorId,
  }: RemedyRejectedDocumentInput,
): Promise<RemedyRejectedDocumentOutcome> {
  const fortnight = fortnightContaining(fortnightStart);
  const key = { pointOfSaleNumber, fortnight };
  return store.transaction<RemedyRejectedDocumentOutcome>(async (tx) => {
    await tx.holdFortnightPresentation(key);
    const rejection = await tx.documentTypeReport(key, documentType, locationId);
    if (rejection === null || rejection.rejectedNumber !== number) {
      return { kind: "not_rejected" };
    }
    if (remedyAwaitsResend(rejection, rejection.remedy)) {
      return { kind: "already_remedied" };
    }
    if (!awaitsRemedy(rejection, rejection.remedy)) {
      return { kind: "not_rejected" };
    }

    let recorded = remedy;
    let changes: DocumentFieldChange[] = [];
    if (remedy.kind === "printed") {
      const issued = await tx.documentsOn(pointOfSaleNumber, fortnight, locationId);
      const printed = issued.find((document) => document.number === number);
      if (printed === undefined) {
        return { kind: "document_not_found" };
      }
      const document = presentedOfflineDocument(printed);
      const refusal = offlineDocumentCorrectionRefusal({
        document,
        documents: issued.map(presentedOfflineDocument),
        correction: remedy.correction,
        fortnight,
      });
      if (refusal !== null) {
        return { kind: "correction_refused", refusal };
      }
      changes = correctionChanges(document, remedy.correction);
      recorded = { kind: "printed", correction: correctionAfter(printed.correction, changes) };
    }

    const at = clock.now();
    await tx.recordRemedy({
      pointOfSaleNumber,
      fortnight,
      documentType,
      number,
      remedy: recorded,
      recordedAt: at,
    });
    await tx.recordRemedyAudit({
      pointOfSaleNumber,
      fortnight,
      documentType,
      number,
      kind: remedy.kind,
      actorId,
      at,
      changes,
    });
    return { kind: "remedied", recordedAt: at, changes };
  });
}
