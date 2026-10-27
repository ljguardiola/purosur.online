import type { CreditNoteAnswer, VoidCreditNoteStanding } from "../model/sale-credit-note.js";
import type { RequestPendingCreditNotesPorts } from "./request-credit-notes-ports.js";

export interface RequestedCreditNote {
  creditNoteId: string;
  answer: VoidCreditNoteStanding;
}

export interface RequestPendingCreditNotesOutcome {
  kind: "requested";
  answers: RequestedCreditNote[];
}

const IN_PROGRESS: CreditNoteAnswer = { kind: "in_progress" };

export async function requestPendingCreditNotes({
  creditNotes,
  cloud,
  clock,
}: RequestPendingCreditNotesPorts): Promise<RequestPendingCreditNotesOutcome> {
  const pending = await creditNotes.inProgress();
  const pointOfSale = await creditNotes.realTimePointOfSale();
  const answers: RequestedCreditNote[] = [];
  for (const { creditNoteId, saleEvent } of pending) {
    const answer =
      pointOfSale === null ? null : await cloud.request({ creditNoteId, pointOfSale, saleEvent });
    if (answer === null || answer.kind === "in_progress") {
      answers.push({ creditNoteId, answer: IN_PROGRESS });
      continue;
    }
    await creditNotes.recordAnswer(creditNoteId, answer, clock.now());
    answers.push({ creditNoteId, answer });
  }
  return { kind: "requested", answers };
}
