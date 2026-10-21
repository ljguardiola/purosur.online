import {
  confirmedCreditNoteAnswer,
  type RestoredCreditNoteAnswer,
} from "../model/sale-void-credit-note.js";
import type { ServeRestoredRegisterCreditNoteAnswersPorts } from "./restored-register-credit-note-answers-ports.js";

export interface ServeRestoredRegisterCreditNoteAnswersInput {
  registerId: string;
  saleIds: readonly string[];
}

export async function serveRestoredRegisterCreditNoteAnswers(
  { creditNotes }: ServeRestoredRegisterCreditNoteAnswersPorts,
  { registerId, saleIds }: ServeRestoredRegisterCreditNoteAnswersInput,
): Promise<RestoredCreditNoteAnswer[]> {
  if (saleIds.length === 0) {
    return [];
  }
  const recorded = await creditNotes.saleVoidCreditNotesOf(registerId, saleIds);
  return recorded.flatMap(({ creditNoteId, pointOfSale, standing, answeredAt }) => {
    const answer = confirmedCreditNoteAnswer(standing, pointOfSale);
    return answer === null || answeredAt === null ? [] : [{ creditNoteId, answeredAt, answer }];
  });
}
