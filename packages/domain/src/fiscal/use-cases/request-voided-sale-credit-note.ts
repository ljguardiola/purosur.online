import type { VoidCreditNoteStanding } from "../model/sale-void-credit-note.js";
import type { RequestVoidedSaleCreditNotePorts } from "./request-void-credit-notes-ports.js";

export interface RequestVoidedSaleCreditNoteInput {
  creditNoteId: string;
  saleId: string;
}

const IN_PROGRESS = { kind: "in_progress" } as const;

export type RequestVoidedSaleCreditNoteOutcome =
  | { kind: "answered"; answer: VoidCreditNoteStanding }
  | { kind: "failed"; answer: typeof IN_PROGRESS; error: unknown };

export async function requestVoidedSaleCreditNote(
  { creditNotes, cloud, clock, printer }: RequestVoidedSaleCreditNotePorts,
  { creditNoteId, saleId }: RequestVoidedSaleCreditNoteInput,
): Promise<RequestVoidedSaleCreditNoteOutcome> {
  let answer: VoidCreditNoteStanding;
  try {
    const pending = await creditNotes.pendingCreditNote(creditNoteId);
    if (pending !== null) {
      const pointOfSale = await creditNotes.realTimePointOfSale();
      const reply =
        pointOfSale === null
          ? null
          : await cloud.request({ creditNoteId, pointOfSale, saleEvent: pending.saleEvent });
      if (reply !== null && reply.kind !== "in_progress") {
        await creditNotes.recordAnswer(creditNoteId, reply, clock.now());
      }
    }
    answer = (await creditNotes.recordedAnswer(creditNoteId)) ?? IN_PROGRESS;
  } catch (error) {
    return { kind: "failed", answer: IN_PROGRESS, error };
  }
  if (answer.kind === "authorized") {
    printer.startPrinting(saleId);
  }
  return { kind: "answered", answer };
}
