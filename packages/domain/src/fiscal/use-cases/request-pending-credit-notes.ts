import type { VoidCreditNoteStanding } from "../model/sale-credit-note.js";
import { askCloudForCreditNote } from "./ask-cloud-for-credit-note.js";
import type { RequestPendingCreditNotesPorts } from "./request-credit-notes-ports.js";

export interface RequestedCreditNote {
  creditNoteId: string;
  answer: VoidCreditNoteStanding;
}

export interface RequestPendingCreditNotesOutcome {
  kind: "requested";
  answers: RequestedCreditNote[];
}

export async function requestPendingCreditNotes({
  creditNotes,
  cloud,
  clock,
}: RequestPendingCreditNotesPorts): Promise<RequestPendingCreditNotesOutcome> {
  const pending = await creditNotes.inProgress();
  const pointOfSale = await creditNotes.realTimePointOfSale();
  const answers: RequestedCreditNote[] = [];
  for (const note of pending) {
    answers.push({
      creditNoteId: note.creditNoteId,
      answer: await askCloudForCreditNote({ creditNotes, cloud, clock }, note, pointOfSale),
    });
  }
  return { kind: "requested", answers };
}
