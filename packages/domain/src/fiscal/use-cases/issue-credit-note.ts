import {
  CREDIT_NOTE_C_VOUCHER_TYPE,
  creditNoteIssueDate,
  mayTakeCreditNoteNumber,
  nextCreditNoteNumber,
  settleUnclearCreditNote,
} from "../model/credit-note.js";
import type { TaxAuthorityRejection } from "../model/fiscal-rejection-standing.js";
import {
  CREDIT_NOTE_C_DOCUMENT_TYPE,
  creditNoteRejectedTask,
  externalInvoicingTask,
} from "../model/fiscal-task.js";
import type { CreditNoteAnswer } from "../model/sale-void-credit-note.js";
import {
  hasUnclearOutcomeSettled,
  UNCLEAR_OUTCOME_REASK_INTERVAL_MS,
  unclearOutcomeSettlesAt,
} from "../model/unclear-outcome-decision.js";
import { solicitationAnswerOf, solicitationRejections } from "./authorize-fiscal-document.js";
import {
  type CreditNoteLane,
  CreditNoteNumberTaken,
  type IssueCreditNotePorts,
} from "./credit-note-ports.js";
import type { SolicitationAnswer } from "./fiscal-document-authorization-ports.js";
import { taxAuthorityEvidenceOf } from "./tax-authority-evidence.js";

export interface IssueCreditNoteInput {
  creditNoteId: string;
}

interface AuthorizedCreditNote {
  pointOfSale: number;
  number: number;
  issuedOn: string;
  issuedAt: Date;
  authorizationCode: string;
  authorizationCodeDueOn: string;
}

export type IssueCreditNoteOutcome =
  | ({ kind: "authorized" } & AuthorizedCreditNote)
  | ({ kind: "adopted" } & AuthorizedCreditNote)
  | { kind: "rejected"; rejections: readonly TaxAuthorityRejection[] }
  | ({ kind: "already_authorized" } & AuthorizedCreditNote)
  | { kind: "already_rejected" }
  | { kind: "retry"; askAgainAt: Date }
  | { kind: "not_found" };

export async function issueCreditNote(
  ports: IssueCreditNotePorts,
  { creditNoteId }: IssueCreditNoteInput,
): Promise<IssueCreditNoteOutcome> {
  const { requests, lanes, clock, tokens, taxAuthority, creditNotes } = ports;
  const pointOfSale = await requests.pointOfSaleOf(creditNoteId);
  if (pointOfSale === null) {
    return { kind: "not_found" };
  }

  return lanes.inPointOfSaleLane<IssueCreditNoteOutcome>(pointOfSale, async (lane) => {
    const creditNote = await lane.creditNote(creditNoteId);
    if (creditNote === null) {
      return { kind: "not_found" };
    }
    const { standing } = creditNote;
    if (standing.kind === "authorized") {
      const { kind: _kind, requestedAt, ...authorized } = standing;
      return { kind: "already_authorized", pointOfSale, issuedAt: requestedAt, ...authorized };
    }
    if (standing.kind === "rejected") {
      return { kind: "already_rejected" };
    }

    const retryLater = (): IssueCreditNoteOutcome => ({
      kind: "retry",
      askAgainAt: new Date(clock.now().getTime() + UNCLEAR_OUTCOME_REASK_INTERVAL_MS),
    });
    const token = await tokens.validToken();
    if (token === null) {
      return retryLater();
    }

    if (standing.kind === "requested") {
      const unclearSince = standing.unclearAnsweredAt ?? standing.requestedAt;
      if (!hasUnclearOutcomeSettled(unclearSince, clock.now())) {
        return { kind: "retry", askAgainAt: unclearOutcomeSettlesAt(unclearSince) };
      }
      const settlement = settleUnclearCreditNote({
        unclearSince,
        now: clock.now(),
        creditNote: {
          number: standing.number,
          issuedOn: standing.issuedOn,
          total: creditNote.total,
          receiverTaxStatusCode: creditNote.receiverTaxStatusCode,
        },
        evidence: await taxAuthorityEvidenceOf(ports, token, {
          pointOfSale,
          voucherType: CREDIT_NOTE_C_VOUCHER_TYPE,
          number: standing.number,
        }),
      });
      if (settlement.kind === "pending") {
        return { kind: "retry", askAgainAt: settlement.askAgainAt };
      }
      if (settlement.kind === "adopted") {
        const { authorizationCode, authorizationCodeDueOn } = settlement;
        await lane.recordCreditNoteAuthorized({
          creditNoteId,
          authorizationCode,
          authorizationCodeDueOn,
          authorizedAt: clock.now(),
        });
        return {
          kind: "adopted",
          pointOfSale,
          number: standing.number,
          issuedOn: standing.issuedOn,
          issuedAt: standing.requestedAt,
          authorizationCode,
          authorizationCodeDueOn,
        };
      }
      await lane.releaseCreditNoteRequest(
        creditNoteId,
        settlement.foreignVoucher === null
          ? null
          : {
              kind: "external_invoicing",
              externalBilling: {
                pointOfSale,
                documentType: CREDIT_NOTE_C_DOCUMENT_TYPE,
                number: standing.number,
              },
              task: externalInvoicingTask(
                {
                  pointOfSale,
                  documentType: CREDIT_NOTE_C_DOCUMENT_TYPE,
                  number: standing.number,
                  voucher: settlement.foreignVoucher,
                },
                clock.now(),
              ),
            },
      );
    }

    if (!mayTakeCreditNoteNumber(await lane.otherCreditNoteStandings(creditNoteId))) {
      return retryLater();
    }
    const lastAuthorized = await taxAuthority.lastAuthorized({
      token,
      pointOfSale,
      voucherType: CREDIT_NOTE_C_VOUCHER_TYPE,
    });
    if (lastAuthorized.kind === "no_answer") {
      return retryLater();
    }

    const requestedAt = clock.now();
    const number = nextCreditNoteNumber(lastAuthorized.number);
    const issuedOn = creditNoteIssueDate(requestedAt);
    try {
      await lane.recordCreditNoteRequest({ creditNoteId, number, issuedOn, requestedAt });
    } catch (error) {
      if (error instanceof CreditNoteNumberTaken) {
        return retryLater();
      }
      throw error;
    }

    const solicitation = await creditNotes.solicit({
      token,
      pointOfSale,
      number,
      issuedOn,
      total: creditNote.total,
      receiverTaxStatusCode: creditNote.receiverTaxStatusCode,
      associatedVoucher: creditNote.associatedVoucher,
    });
    return recordAnswer(lane, {
      creditNoteId,
      pointOfSale,
      number,
      issuedOn,
      requestedAt,
      solicitation,
      answeredAt: clock.now(),
    });
  });
}

async function recordAnswer(
  lane: CreditNoteLane,
  {
    creditNoteId,
    pointOfSale,
    number,
    issuedOn,
    requestedAt,
    solicitation,
    answeredAt,
  }: {
    creditNoteId: string;
    pointOfSale: number;
    number: number;
    issuedOn: string;
    requestedAt: Date;
    solicitation: SolicitationAnswer;
    answeredAt: Date;
  },
): Promise<IssueCreditNoteOutcome> {
  const answer = solicitationAnswerOf(solicitation);
  if (answer.kind === "authorized") {
    const { authorizationCode, authorizationCodeDueOn } = answer;
    await lane.recordCreditNoteAuthorized({
      creditNoteId,
      authorizationCode,
      authorizationCodeDueOn,
      authorizedAt: answeredAt,
    });
    return {
      kind: "authorized",
      pointOfSale,
      number,
      issuedOn,
      issuedAt: requestedAt,
      authorizationCode,
      authorizationCodeDueOn,
    };
  }
  if (answer.kind === "rejected") {
    const rejections = solicitationRejections(solicitation);
    await lane.recordCreditNoteRejected({
      creditNoteId,
      rejections,
      rejectedAt: answeredAt,
      task: creditNoteRejectedTask({ creditNoteId, pointOfSale, number, rejections }, answeredAt),
    });
    return { kind: "rejected", rejections };
  }
  await lane.recordCreditNoteUnclear(creditNoteId, answeredAt);
  return { kind: "retry", askAgainAt: unclearOutcomeSettlesAt(answeredAt) };
}

export function creditNoteAnswerOf(outcome: IssueCreditNoteOutcome): CreditNoteAnswer | null {
  switch (outcome.kind) {
    case "authorized":
    case "adopted":
    case "already_authorized": {
      const { kind: _kind, ...authorized } = outcome;
      return { kind: "authorized", ...authorized };
    }
    case "rejected":
    case "already_rejected":
      return { kind: "rejected" };
    case "retry":
      return { kind: "in_progress" };
    case "not_found":
      return null;
  }
}
