import { FACTURA_C_VOUCHER_TYPE } from "../model/factura-c-fiscal-block.js";
import {
  decideOrphanAuthorization,
  type LocalStanding,
  type OrphanRegularization,
  orphanRegularization,
} from "../model/orphan-authorization.js";
import {
  awaitsUnclearOutcomeDecision,
  decideUnclearOutcome,
  hasUnclearOutcomeSettled,
  type TaxAuthorityEvidence,
  type UnclearOutcomeDecision,
  unclearOutcomeSettlesAt,
} from "../model/unclear-outcome-decision.js";
import { taxAuthorityEvidenceOf } from "./tax-authority-evidence.js";
import type {
  DecideUnclearRealTimeOutcomePorts,
  UnclearOutcomeLane,
  UnclearRequest,
} from "./unclear-outcome-ports.js";

export interface DecideUnclearRealTimeOutcomeInput {
  fiscalDocumentId: string;
}

export type DecideUnclearRealTimeOutcomeOutcome =
  | { kind: "decided"; decision: UnclearOutcomeDecision }
  | { kind: "already_decided"; decision: UnclearOutcomeDecision }
  | { kind: "pending"; askAgainAt: Date }
  | { kind: "not_unclear" }
  | { kind: "not_found" };

async function evidenceOf(
  ports: DecideUnclearRealTimeOutcomePorts,
  { pointOfSale, number }: UnclearRequest,
): Promise<TaxAuthorityEvidence> {
  const token = await ports.tokens.validToken();
  if (token === null) {
    return { kind: "no_answer" };
  }
  return taxAuthorityEvidenceOf(ports, token, {
    pointOfSale,
    voucherType: FACTURA_C_VOUCHER_TYPE,
    number,
  });
}

async function regularizationOf(
  { ids, clock }: DecideUnclearRealTimeOutcomePorts,
  lane: UnclearOutcomeLane,
  request: UnclearRequest,
  verdict: UnclearOutcomeDecision,
  evidence: TaxAuthorityEvidence,
): Promise<OrphanRegularization | null> {
  if (
    evidence.kind !== "voucher" ||
    (verdict.kind !== "adopted" && verdict.kind !== "conflicting")
  ) {
    return null;
  }
  const { pointOfSale, number, saleId, fiscalDocumentId } = request;
  const local: LocalStanding =
    verdict.kind === "conflicting"
      ? { kind: "no_local_sale" }
      : {
          kind: "local_sale",
          saleId,
          otherAuthorizedVoucher: await lane.otherAuthorizedVoucherOfSale(saleId, fiscalDocumentId),
        };
  return orphanRegularization(
    decideOrphanAuthorization({
      evidence: { kind: "confirmed", pointOfSale, number, voucher: evidence.voucher },
      local,
    }),
    { creditNoteId: ids.next(), now: clock.now() },
  );
}

export async function decideUnclearRealTimeOutcome(
  ports: DecideUnclearRealTimeOutcomePorts,
  { fiscalDocumentId }: DecideUnclearRealTimeOutcomeInput,
): Promise<DecideUnclearRealTimeOutcomeOutcome> {
  const { requests, lanes, clock } = ports;
  const pointOfSale = await requests.pointOfSaleOf(fiscalDocumentId);
  if (pointOfSale === null) {
    return { kind: "not_found" };
  }

  return lanes.inPointOfSaleLane<DecideUnclearRealTimeOutcomeOutcome>(pointOfSale, async (lane) => {
    const request = await lane.unclearRequest(fiscalDocumentId);
    if (request === null) {
      return { kind: "not_found" };
    }
    if (request.decision !== null) {
      return { kind: "already_decided", decision: request.decision };
    }

    if (
      request.progress.kind === "answered" &&
      !awaitsUnclearOutcomeDecision(request.progress.answer)
    ) {
      return { kind: "not_unclear" };
    }

    const now = clock.now();
    let abandonedAt: Date;
    if (request.progress.kind === "no_answer") {
      await lane.recordAbandonment(fiscalDocumentId, now);
      abandonedAt = now;
    } else if (request.progress.answer.kind === "not_attempted") {
      const decision: UnclearOutcomeDecision = { kind: "released" };
      await lane.recordDecision(
        fiscalDocumentId,
        decision,
        now,
        { fiscalDocumentId, clearedAt: now },
        null,
      );
      return { kind: "decided", decision };
    } else {
      abandonedAt = request.progress.answeredAt;
    }

    if (!hasUnclearOutcomeSettled(abandonedAt, now)) {
      return { kind: "pending", askAgainAt: unclearOutcomeSettlesAt(abandonedAt) };
    }

    const evidence = await evidenceOf(ports, request);
    const verdict = decideUnclearOutcome({ abandonedAt, now, document: request, evidence });
    if (verdict.kind === "pending") {
      return verdict;
    }
    await lane.recordDecision(
      fiscalDocumentId,
      verdict,
      now,
      { fiscalDocumentId, clearedAt: now },
      await regularizationOf(ports, lane, request, verdict, evidence),
    );
    return { kind: "decided", decision: verdict };
  });
}
