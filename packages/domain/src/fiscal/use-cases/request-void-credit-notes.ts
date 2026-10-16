import type { CreditNoteAnswer } from "../model/sale-void-credit-note.js";
import type { RequestVoidCreditNotesPorts } from "./request-void-credit-notes-ports.js";

export interface RequestedCreditNote {
  creditNoteId: string;
  answer: CreditNoteAnswer;
}

export interface RequestVoidCreditNotesOutcome {
  kind: "requested";
  answers: RequestedCreditNote[];
}

const IN_PROGRESS: CreditNoteAnswer = { kind: "in_progress" };

export async function requestVoidCreditNotes({
  creditNotes,
  cloud,
  clock,
}: RequestVoidCreditNotesPorts): Promise<RequestVoidCreditNotesOutcome> {
  const pending = await creditNotes.inProgress();
  const pointOfSale = pending.length === 0 ? null : await creditNotes.realTimePointOfSale();
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
