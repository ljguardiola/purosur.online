import { argentinaInstant, shiftCalendarDay } from "../../shared/index.js";
import type { Fortnight } from "./offline-authorization-code.js";

export type FortnightReportState =
  | "blocked"
  | "submitting"
  | "refused"
  | "accepted"
  | "needs_regularization";

export type DocumentTypeReportState = Exclude<FortnightReportState, "needs_regularization">;

export type FortnightReportMovement = "none" | "documents";

export type UnreportedDocumentsRemedy = "report_the_rest" | "manual_regularization";

export type OfflineDocumentBatch<TDocument> =
  | { kind: "batch"; documents: TDocument[] }
  | { kind: "gap"; expectedNumber: number }
  | { kind: "all_reported" };

export type FortnightReportStanding =
  | { kind: "not_due" }
  | { kind: "pending"; daysLeft: number; pressing: boolean }
  | { kind: "missed" };

const FORTNIGHT_REPORT_RETRY_INTERVAL_MS = 60 * 60 * 1000;

const DAYS_TO_REPORT_AFTER_CLOSE = 8;
const PRESSING_DAYS_LEFT = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

export function fortnightClosesAt({ end }: Fortnight): Date {
  return new Date(argentinaInstant(shiftCalendarDay(end, 1), "00:00"));
}

export function fortnightReportDeadline(
  fortnight: Fortnight,
  taxAuthorityDeadline: string,
): string {
  const eighthDay = shiftCalendarDay(fortnight.end, DAYS_TO_REPORT_AFTER_CLOSE);
  return [taxAuthorityDeadline, eighthDay].sort()[0] ?? eighthDay;
}

function hasFortnightClosed({ end }: Fortnight, today: string): boolean {
  return end < today;
}

export function owesFortnightReport(
  { fortnight, claimedAt }: { fortnight: Fortnight; claimedAt: Date },
  today: string,
): boolean {
  return hasFortnightClosed(fortnight, today) && claimedAt < fortnightClosesAt(fortnight);
}

export function isFortnightReportOutstanding(state: FortnightReportState | null): boolean {
  return state !== "accepted" && state !== "needs_regularization";
}

export function remedyForUnreportedDocuments(
  movement: FortnightReportMovement,
): UnreportedDocumentsRemedy {
  return movement === "documents" ? "report_the_rest" : "manual_regularization";
}

export function isOfflineDocumentReported(number: number, reportedThrough: number | null): boolean {
  return reportedThrough !== null && number <= reportedThrough;
}

export function offlineDocumentPresentations<
  TDocument extends { documentType: string; number: number },
>(documents: TDocument[]): { documentType: TDocument["documentType"]; documents: TDocument[] }[] {
  const byType = new Map<TDocument["documentType"], TDocument[]>();
  for (const document of documents) {
    byType.set(document.documentType, [...(byType.get(document.documentType) ?? []), document]);
  }
  return [...byType.entries()]
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([documentType, presented]) => ({
      documentType,
      documents: presented.sort((left, right) => left.number - right.number),
    }));
}

export function nextOfflineDocumentBatch<TDocument extends { number: number }>(
  documents: TDocument[],
  lastReported: number,
  limit: number,
): OfflineDocumentBatch<TDocument> {
  const pending = documents.filter(({ number }) => number > lastReported);
  if (pending.length === 0) {
    return { kind: "all_reported" };
  }
  const batch: TDocument[] = [];
  for (const document of pending) {
    if (batch.length === limit || document.number !== lastReported + 1 + batch.length) {
      break;
    }
    batch.push(document);
  }
  return batch.length === 0
    ? { kind: "gap", expectedNumber: lastReported + 1 }
    : { kind: "batch", documents: batch };
}

export function fortnightReportStateOfDocumentTypes(
  states: DocumentTypeReportState[],
): DocumentTypeReportState {
  for (const state of ["refused", "blocked", "submitting"] as const) {
    if (states.includes(state)) {
      return state;
    }
  }
  return "accepted";
}

export function documentTypePresentationState(
  recorded: DocumentTypeReportState | null,
  fortnightState: FortnightReportState | null,
): DocumentTypeReportState | null {
  if (recorded !== null) {
    return recorded;
  }
  return fortnightState === "blocked" ? "blocked" : null;
}

export interface FortnightPresentationRow<TDocumentType extends string> {
  documentType: TDocumentType | null;
  state: FortnightReportState | null;
  documentCount: number;
  rejectedDocument: { number: number; unprocessed: number } | null;
}

export function fortnightPresentationRows<TDocumentType extends string>({
  state,
  documents,
  documentReports,
}: {
  state: FortnightReportState | null;
  documents: { documentType: TDocumentType; number: number }[];
  documentReports: {
    documentType: TDocumentType;
    state: DocumentTypeReportState;
    rejectedNumber: number | null;
  }[];
}): FortnightPresentationRow<TDocumentType>[] {
  if (state === "needs_regularization" || documents.length === 0) {
    return [{ documentType: null, state, documentCount: documents.length, rejectedDocument: null }];
  }
  return offlineDocumentPresentations(documents).map((presentation) => {
    const report = documentReports.find(
      ({ documentType }) => documentType === presentation.documentType,
    );
    const rejectedNumber = report?.state === "refused" ? report.rejectedNumber : null;
    return {
      documentType: presentation.documentType,
      state: documentTypePresentationState(report?.state ?? null, state),
      documentCount: presentation.documents.length,
      rejectedDocument:
        rejectedNumber === null
          ? null
          : {
              number: rejectedNumber,
              unprocessed: presentation.documents.filter(({ number }) => number > rejectedNumber)
                .length,
            },
    };
  });
}

export function fortnightReportStanding(
  report: { fortnight: Fortnight; deadline: string; state: FortnightReportState | null },
  today: string,
): FortnightReportStanding {
  if (!isFortnightReportOutstanding(report.state) || !hasFortnightClosed(report.fortnight, today)) {
    return { kind: "not_due" };
  }
  if (today > report.deadline) {
    return { kind: "missed" };
  }
  const daysLeft = Math.round(
    (Date.parse(`${report.deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS,
  );
  return { kind: "pending", daysLeft, pressing: daysLeft <= PRESSING_DAYS_LEFT };
}

export function isFortnightReportRetryDue(lastAttemptAt: Date, now: Date): boolean {
  return now.getTime() - lastAttemptAt.getTime() >= FORTNIGHT_REPORT_RETRY_INTERVAL_MS;
}
