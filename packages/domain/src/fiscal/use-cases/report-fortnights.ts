import { argentinaCalendarDay, argentinaInstant, shiftCalendarDay } from "../../shared/index.js";
import { streamReachesPast } from "../../sync/index.js";
import type { TaxAuthorityRejection } from "../model/fiscal-rejection-standing.js";
import { fortnightClosesAt, isFortnightReportRetryDue } from "../model/fortnight-report.js";
import {
  type Fortnight,
  fortnightContaining,
  isSameFortnight,
} from "../model/offline-authorization-code.js";
import type {
  FortnightReportPorts,
  HeldFortnightReport,
  OwedFortnightReport,
} from "./fortnight-report-ports.js";
import type { WsaaToken } from "./wsaa-token-ports.js";

const DAYS_TO_RECOVER_AFTER_CLOSE = 8;

export type FortnightPresentationOutcome =
  | { kind: "retry_not_due" }
  | { kind: "already_declared" }
  | { kind: "lookup_refused"; rejections: TaxAuthorityRejection[] }
  | { kind: "lookup_no_answer" }
  | { kind: "has_documents" }
  | { kind: "blocked" }
  | { kind: "accepted" }
  | { kind: "refused"; rejections: TaxAuthorityRejection[] }
  | { kind: "unclear" };

export interface FortnightPresentation {
  pointOfSaleNumber: number;
  fortnight: Fortnight;
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
    const outcome = await ports.reports.holdReport(
      { pointOfSaleNumber: owed.pointOfSaleNumber, fortnight: owed.code.fortnight },
      (report) => presentFortnight(ports, token, owed, report),
    );
    presentations.push({
      pointOfSaleNumber: owed.pointOfSaleNumber,
      fortnight: owed.code.fortnight,
      outcome,
    });
  }
  return { kind: "reported", presentations };
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
  { documents, streams, declarations, clock }: FortnightReportPorts,
  token: WsaaToken,
  { pointOfSaleNumber, registerId, code }: OwedFortnightReport,
  report: HeldFortnightReport,
): Promise<FortnightPresentationOutcome> {
  const recorded = await report.recorded();
  if (
    recorded?.state === "refused" &&
    recorded.lastAttemptAt !== null &&
    !isFortnightReportRetryDue(recorded.lastAttemptAt, clock.now())
  ) {
    return { kind: "retry_not_due" };
  }

  const call = { token, pointOfSaleNumber, code: code.code };
  const held = await declarations.lookUp(call);
  if (held.kind === "held") {
    await report.record({ state: "accepted", at: clock.now() });
    return { kind: "already_declared" };
  }
  if (held.kind === "refused") {
    return { kind: "lookup_refused", rejections: held.rejections };
  }
  if (held.kind === "no_answer") {
    return { kind: "lookup_no_answer" };
  }

  if ((await documents.countOn(pointOfSaleNumber, code.fortnight)) > 0) {
    return { kind: "has_documents" };
  }

  const reaches = streamReachesPast(await streams.installationsOf(registerId), {
    from: new Date(argentinaInstant(code.fortnight.start, "00:00")),
    until: fortnightClosesAt(code.fortnight),
  });
  if (!reaches) {
    await report.record({ state: "blocked", at: clock.now() });
    return { kind: "blocked" };
  }

  await report.record({ state: "submitting", at: clock.now() });
  const answer = await declarations.declare(call);
  switch (answer.kind) {
    case "accepted":
      await report.record({ state: "accepted", at: clock.now() });
      return { kind: "accepted" };
    case "refused":
      await report.record({
        state: "refused",
        at: clock.now(),
        rejections: answer.rejections,
      });
      return { kind: "refused", rejections: answer.rejections };
    case "no_answer":
      return { kind: "unclear" };
  }
}
