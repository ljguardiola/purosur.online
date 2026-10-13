import {
  awaitsUnclearOutcomeDecision,
  decideUnclearOutcome,
  hasUnclearOutcomeSettled,
  type TaxAuthorityEvidence,
  type UnclearOutcomeDecision,
  unclearOutcomeSettlesAt,
} from "../model/unclear-outcome-decision.js";
import type { DecideUnclearRealTimeOutcomePorts, UnclearRequest } from "./unclear-outcome-ports.js";

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
  { tokens, vouchers, taxAuthority }: DecideUnclearRealTimeOutcomePorts,
  { pointOfSale, number }: UnclearRequest,
): Promise<TaxAuthorityEvidence> {
  const token = await tokens.validToken();
  if (token === null) {
    return { kind: "no_answer" };
  }
  const voucher = await vouchers.voucherAt({ token, pointOfSale, number });
  if (voucher.kind === "found") {
    return { kind: "voucher", voucher: voucher.voucher };
  }
  if (voucher.kind === "no_answer") {
    return { kind: "no_answer" };
  }
  const lastAuthorized = await taxAuthority.lastAuthorized({ token, pointOfSale });
  return {
    kind: "no_voucher",
    lastAuthorized: lastAuthorized.kind === "read" ? lastAuthorized.number : null,
  };
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
      await lane.recordDecision(fiscalDocumentId, decision, now, {
        fiscalDocumentId,
        clearedAt: now,
      });
      return { kind: "decided", decision };
    } else {
      abandonedAt = request.progress.answeredAt;
    }

    if (!hasUnclearOutcomeSettled(abandonedAt, now)) {
      return { kind: "pending", askAgainAt: unclearOutcomeSettlesAt(abandonedAt) };
    }

    const verdict = decideUnclearOutcome({
      abandonedAt,
      now,
      document: request,
      evidence: await evidenceOf(ports, request),
    });
    if (verdict.kind === "pending") {
      return verdict;
    }
    await lane.recordDecision(fiscalDocumentId, verdict, now, { fiscalDocumentId, clearedAt: now });
    return { kind: "decided", decision: verdict };
  });
}
