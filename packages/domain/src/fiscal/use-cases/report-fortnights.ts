import { argentinaCalendarDay, argentinaInstant, shiftCalendarDay } from "../../shared/index.js";
import { streamReachesPast } from "../../sync/index.js";
import type {
  FiscalDocumentType,
  TaxAuthorityRejection,
} from "../model/fiscal-rejection-standing.js";
import {
  type DocumentTypeReportState,
  fortnightClosesAt,
  fortnightReportStateOfDocumentTypes,
  isFortnightReportRetryDue,
  nextOfflineDocumentBatch,
  offlineDocumentPresentations,
  remedyForUnreportedDocuments,
} from "../model/fortnight-report.js";
import {
  type Fortnight,
  fortnightContaining,
  isSameFortnight,
} from "../model/offline-authorization-code.js";
import type {
  FortnightReportPorts,
  HeldFortnightReport,
  OfflineDocumentOfFortnight,
  OwedFortnightReport,
} from "./fortnight-report-ports.js";
import type { WsaaToken } from "./wsaa-token-ports.js";

const DAYS_TO_RECOVER_AFTER_CLOSE = 8;

export type FortnightPresentationOutcome =
  | { kind: "retry_not_due" }
  | { kind: "already_declared" }
  | { kind: "lookup_refused"; rejections: TaxAuthorityRejection[] }
  | { kind: "lookup_no_answer" }
  | { kind: "blocked" }
  | { kind: "accepted" }
  | { kind: "refused"; rejections: TaxAuthorityRejection[] }
  | { kind: "rejected"; number: number; rejections: TaxAuthorityRejection[] }
  | { kind: "gap"; expectedNumber: number }
  | { kind: "unclear" }
  | { kind: "needs_regularization" };

export interface FortnightPresentation {
  pointOfSaleNumber: number;
  fortnight: Fortnight;
  documentType: FiscalDocumentType | null;
  outcome: FortnightPresentationOutcome;
}

export type ReportFortnightsOutcome =
  | { kind: "no_token" }
  | { kind: "reported"; presentations: FortnightPresentation[] };

export async function reportFortnights(
  ports: FortnightReportPorts,
): Promise<ReportFortnightsOutcome> {
  const token = await ports.tokens.validToken();
  if (token === null) {
    return { kind: "no_token" };
  }
  const today = argentinaCalendarDay(ports.clock.now());
  await recoverLastClosedFortnightCode(ports, token, today);

  const presentations: FortnightPresentation[] = [];
  for (const owed of await ports.reports.owedReports(today)) {
    presentations.push(
      ...(await ports.reports.holdReport(keyOf(owed), (report) =>
        presentFortnight(ports, token, owed, report),
      )),
    );
  }
  for (const accepted of await ports.reports.acceptedWithUnreportedDocuments()) {
    presentations.push(
      ...(await ports.reports.holdReport(keyOf(accepted), (report) =>
        presentUnreportedDocuments(ports, token, accepted, report),
      )),
    );
  }
  return { kind: "reported", presentations };
}

function keyOf({ pointOfSaleNumber, code }: OwedFortnightReport) {
  return { pointOfSaleNumber, fortnight: code.fortnight };
}

function fortnightPresentation(
  { pointOfSaleNumber, code }: OwedFortnightReport,
  outcome: FortnightPresentationOutcome,
): FortnightPresentation {
  return { pointOfSaleNumber, fortnight: code.fortnight, documentType: null, outcome };
}

async function recoverLastClosedFortnightCode(
  { codeStore, codeAuthority, clock }: FortnightReportPorts,
  token: WsaaToken,
  today: string,
): Promise<void> {
  const fortnight = fortnightContaining(shiftCalendarDay(fortnightContaining(today).start, -1));
  if (today > shiftCalendarDay(fortnight.end, DAYS_TO_RECOVER_AFTER_CLOSE)) {
    return;
  }
  if (!(await codeStore.hasOfflinePointOfSale())) {
    return;
  }
  await codeStore.holdAcquisition(fortnight, async (acquisition) => {
    if (await acquisition.isHeld()) {
      return;
    }
    const answer = await codeAuthority.lookUp({ token, fortnight });
    if (answer.kind === "granted" && isSameFortnight(answer.code.fortnight, fortnight)) {
      await acquisition.keep({
        code: answer.code,
        obtainedAt: clock.now(),
        obtainedThrough: "recovered",
      });
    }
  });
}

async function presentFortnight(
  ports: FortnightReportPorts,
  token: WsaaToken,
  owed: OwedFortnightReport,
  report: HeldFortnightReport,
): Promise<FortnightPresentation[]> {
  const { documents, streams, declarations, clock } = ports;
  const { pointOfSaleNumber, registerId, code } = owed;
  const presentation = (outcome: FortnightPresentationOutcome) => [
    fortnightPresentation(owed, outcome),
  ];
  const recorded = await report.recorded();
  if (
    recorded?.state === "refused" &&
    recorded.lastAttemptAt !== null &&
    !isFortnightReportRetryDue(recorded.lastAttemptAt, clock.now())
  ) {
    return presentation({ kind: "retry_not_due" });
  }

  const call = { token, pointOfSaleNumber, code: code.code };
  const held = await declarations.lookUp(call);
  if (held.kind === "held") {
    await report.record({ state: "accepted", at: clock.now(), movement: "none" });
    return presentation({ kind: "already_declared" });
  }
  if (held.kind === "refused") {
    return presentation({ kind: "lookup_refused", rejections: held.rejections });
  }
  if (held.kind === "no_answer") {
    return presentation({ kind: "lookup_no_answer" });
  }

  if (!(await reachesPastClose(ports, registerId, code.fortnight))) {
    await report.record({ state: "blocked", at: clock.now() });
    return presentation({ kind: "blocked" });
  }

  const issued = await documents.documentsOn(pointOfSaleNumber, code.fortnight);
  if (issued.length > 0) {
    return presentDocuments(ports, token, owed, report, issued);
  }

  await report.record({ state: "submitting", at: clock.now() });
  const answer = await declarations.declare(call);
  switch (answer.kind) {
    case "accepted":
      await report.record({ state: "accepted", at: clock.now(), movement: "none" });
      return presentation({ kind: "accepted" });
    case "refused":
      await report.record({
        state: "refused",
        at: clock.now(),
        rejections: answer.rejections,
      });
      return presentation({ kind: "refused", rejections: answer.rejections });
    case "no_answer":
      return presentation({ kind: "unclear" });
  }
}

async function reachesPastClose(
  { streams }: FortnightReportPorts,
  registerId: string,
  fortnight: Fortnight,
): Promise<boolean> {
  return streamReachesPast(await streams.installationsOf(registerId), {
    from: new Date(argentinaInstant(fortnight.start, "00:00")),
    until: fortnightClosesAt(fortnight),
  });
}

async function presentUnreportedDocuments(
  ports: FortnightReportPorts,
  token: WsaaToken,
  accepted: OwedFortnightReport,
  report: HeldFortnightReport,
): Promise<FortnightPresentation[]> {
  const recorded = await report.recorded();
  if (recorded?.state !== "accepted" || recorded.movement === null) {
    return [];
  }
  const issued = await ports.documents.documentsOn(
    accepted.pointOfSaleNumber,
    accepted.code.fortnight,
  );
  if (issued.length === 0) {
    return [];
  }
  if (remedyForUnreportedDocuments(recorded.movement) === "manual_regularization") {
    await report.record({ state: "needs_regularization", at: ports.clock.now() });
    return [fortnightPresentation(accepted, { kind: "needs_regularization" })];
  }
  if (!(await reachesPastClose(ports, accepted.registerId, accepted.code.fortnight))) {
    await report.record({ state: "blocked", at: ports.clock.now() });
    return [fortnightPresentation(accepted, { kind: "blocked" })];
  }
  return presentDocuments(ports, token, accepted, report, issued);
}

async function presentDocuments(
  ports: FortnightReportPorts,
  token: WsaaToken,
  owed: OwedFortnightReport,
  report: HeldFortnightReport,
  issued: OfflineDocumentOfFortnight[],
): Promise<FortnightPresentation[]> {
  const presentations: FortnightPresentation[] = [];
  const states: DocumentTypeReportState[] = [];
  let rejections: TaxAuthorityRejection[] | undefined;
  for (const { documentType, documents } of offlineDocumentPresentations(issued)) {
    const outcome = await presentDocumentType(ports, token, owed, report, documentType, documents);
    presentations.push({ ...fortnightPresentation(owed, outcome), documentType });
    const state = documentTypeStateOf(outcome);
    if (state === null) {
      continue;
    }
    states.push(state);
    if (rejections === undefined && "rejections" in outcome) {
      rejections = outcome.rejections;
    }
  }
  if (states.length === 0) {
    return presentations;
  }
  const state = fortnightReportStateOfDocumentTypes(states);
  const at = ports.clock.now();
  if (state === "accepted") {
    await report.record({ state, at, movement: "documents" });
  } else if (state === "refused") {
    await report.record({ state, at, ...(rejections === undefined ? {} : { rejections }) });
  } else {
    await report.record({ state, at });
  }
  return presentations;
}

function documentTypeStateOf(
  outcome: FortnightPresentationOutcome,
): DocumentTypeReportState | null {
  switch (outcome.kind) {
    case "accepted":
      return "accepted";
    case "gap":
      return "blocked";
    case "refused":
    case "rejected":
      return "refused";
    case "unclear":
      return "submitting";
    default:
      return null;
  }
}

async function presentDocumentType(
  { documentReports, clock }: FortnightReportPorts,
  token: WsaaToken,
  { pointOfSaleNumber, code }: OwedFortnightReport,
  report: HeldFortnightReport,
  documentType: FiscalDocumentType,
  documents: OfflineDocumentOfFortnight[],
): Promise<FortnightPresentationOutcome> {
  let acceptedThrough = 0;
  for (;;) {
    const last = await documentReports.lastReported({ token, pointOfSaleNumber, documentType });
    if (last.kind !== "read") {
      return lookupOutcome(last);
    }
    if (last.number < acceptedThrough) {
      return { kind: "unclear" };
    }
    const pending = nextOfflineDocumentBatch(documents, last.number, Number.POSITIVE_INFINITY);
    if (pending.kind === "all_reported") {
      const reportedThrough = documents.at(-1)?.number ?? last.number;
      await report.recordDocumentType({
        documentType,
        state: "accepted",
        at: clock.now(),
        reportedThrough,
      });
      return { kind: "accepted" };
    }
    if (pending.kind === "gap") {
      await report.recordDocumentType({
        documentType,
        state: "blocked",
        at: clock.now(),
        reportedThrough: last.number,
      });
      return pending;
    }

    const limit = await documentReports.batchLimit(token);
    if (limit.kind !== "read") {
      return lookupOutcome(limit);
    }
    const batch = nextOfflineDocumentBatch(documents, last.number, limit.limit);
    if (batch.kind !== "batch") {
      return { kind: "unclear" };
    }

    await report.recordDocumentType({
      documentType,
      state: "submitting",
      at: clock.now(),
      reportedThrough: last.number,
    });
    const answer = await documentReports.report({
      token,
      pointOfSaleNumber,
      documentType,
      code: code.code,
      documents: batch.documents,
    });
    switch (answer.kind) {
      case "accepted":
        acceptedThrough = batch.documents.at(-1)?.number ?? last.number;
        continue;
      case "rejected":
        await report.recordDocumentType({
          documentType,
          state: "refused",
          at: clock.now(),
          reportedThrough: answer.number - 1,
          rejectedNumber: answer.number,
          rejections: answer.rejections,
        });
        return answer;
      case "refused":
        await report.recordDocumentType({
          documentType,
          state: "refused",
          at: clock.now(),
          reportedThrough: last.number,
          rejections: answer.rejections,
        });
        return answer;
      case "no_answer":
        return { kind: "unclear" };
    }
  }
}

function lookupOutcome(
  answer: { kind: "refused"; rejections: TaxAuthorityRejection[] } | { kind: "no_answer" },
): FortnightPresentationOutcome {
  return answer.kind === "refused"
    ? { kind: "lookup_refused", rejections: answer.rejections }
    : { kind: "lookup_no_answer" };
}
