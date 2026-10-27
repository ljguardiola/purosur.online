import type { VoidCreditNoteStanding } from "../model/sale-credit-note.js";
import { askCloudForCreditNote } from "./ask-cloud-for-credit-note.js";
import type { RequestSaleCreditNotePorts } from "./request-credit-notes-ports.js";

export interface RequestSaleCreditNoteInput {
  creditNoteId: string;
  saleId: string;
}

const IN_PROGRESS = { kind: "in_progress" } as const;

export type RequestSaleCreditNoteOutcome =
  | { kind: "answered"; answer: VoidCreditNoteStanding }
  | { kind: "failed"; answer: typeof IN_PROGRESS; error: unknown };

export async function requestSaleCreditNote(
  { creditNotes, cloud, clock, printer }: RequestSaleCreditNotePorts,
  { creditNoteId, saleId }: RequestSaleCreditNoteInput,
): Promise<RequestSaleCreditNoteOutcome> {
  let answer: VoidCreditNoteStanding;
  try {
    const pending = await creditNotes.pendingCreditNote(creditNoteId);
    if (pending !== null) {
      await askCloudForCreditNote(
        { creditNotes, cloud, clock },
        pending,
        await creditNotes.realTimePointOfSale(),
      );
    }
    answer = (await creditNotes.recordedAnswer(creditNoteId)) ?? IN_PROGRESS;
  } catch (error) {
    return { kind: "failed", answer: IN_PROGRESS, error };
  }
  if (answer.kind === "authorized" || answer.kind === "issued_offline") {
    printer.startPrinting({ saleId, creditNoteId });
  }
  return { kind: "answered", answer };
}
