import {
  type CreditNoteIssuedOffline,
  type RestoredCreditNoteAnswer,
  restoredCreditNoteSettlement,
} from "../model/sale-void-credit-note.js";
import type {
  IssuedOfflineCreditNoteOfRegister,
  ServeRestoredRegisterCreditNoteAnswersPorts,
} from "./restored-register-credit-note-answers-ports.js";

function creditNoteIssuedOffline({
  creditNoteId: _creditNoteId,
  ...issued
}: IssuedOfflineCreditNoteOfRegister): CreditNoteIssuedOffline {
  return { kind: "issued_offline", ...issued };
}

export interface ServeRestoredRegisterCreditNoteAnswersInput {
  registerId: string;
  creditNoteIds: readonly string[];
}

export interface RestoredRegisterCreditNoteAnswersServed {
  answers: RestoredCreditNoteAnswer[];
  unrequestedCreditNoteIds: string[];
}

export async function serveRestoredRegisterCreditNoteAnswers(
  { creditNotes }: ServeRestoredRegisterCreditNoteAnswersPorts,
  { registerId, creditNoteIds }: ServeRestoredRegisterCreditNoteAnswersInput,
): Promise<RestoredRegisterCreditNoteAnswersServed> {
  if (creditNoteIds.length === 0) {
    return { answers: [], unrequestedCreditNoteIds: [] };
  }
  const recorded = await creditNotes.saleVoidCreditNotesOf(registerId, creditNoteIds);
  const refusals = await creditNotes.keptRefusalsOf(registerId, creditNoteIds);
  const issuedOffline = await creditNotes.issuedOfflineOf(registerId, creditNoteIds);

  const served: RestoredRegisterCreditNoteAnswersServed = {
    answers: [],
    unrequestedCreditNoteIds: [],
  };
  for (const creditNoteId of creditNoteIds) {
    const note = recorded.find((candidate) => candidate.creditNoteId === creditNoteId);
    const refusal = refusals.find((candidate) => candidate.creditNoteId === creditNoteId);
    const offline = issuedOffline.find((candidate) => candidate.creditNoteId === creditNoteId);
    const settlement = restoredCreditNoteSettlement(
      note === undefined ? null : { standing: note.standing, pointOfSale: note.pointOfSale },
      refusal !== undefined,
      offline === undefined ? null : creditNoteIssuedOffline(offline),
    );
    if (settlement.kind === "never_requested") {
      served.unrequestedCreditNoteIds.push(creditNoteId);
    } else if (settlement.kind === "answered") {
      const answeredAt =
        settlement.answer.kind === "issued_offline"
          ? settlement.answer.issuedAt
          : note === undefined
            ? refusal?.refusedAt
            : note.answeredAt;
      if (answeredAt !== undefined && answeredAt !== null) {
        served.answers.push({ creditNoteId, answeredAt, answer: settlement.answer });
      }
    }
  }
  return served;
}
