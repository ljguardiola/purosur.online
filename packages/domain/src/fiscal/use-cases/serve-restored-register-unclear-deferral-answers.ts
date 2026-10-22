import {
  type RestoredUnclearDeferralAnswer,
  restoredUnclearDeferralAnswer,
} from "../model/restored-unclear-deferral.js";
import type { ServeRestoredRegisterUnclearDeferralAnswersPorts } from "./restored-register-unclear-deferral-answers-ports.js";

export interface ServeRestoredRegisterUnclearDeferralAnswersInput {
  registerId: string;
  fiscalDocumentIds: readonly string[];
}

export interface ServedUnclearDeferralAnswer {
  fiscalDocumentId: string;
  answer: RestoredUnclearDeferralAnswer;
}

export async function serveRestoredRegisterUnclearDeferralAnswers(
  { unclearDeferrals }: ServeRestoredRegisterUnclearDeferralAnswersPorts,
  { registerId, fiscalDocumentIds }: ServeRestoredRegisterUnclearDeferralAnswersInput,
): Promise<ServedUnclearDeferralAnswer[]> {
  const asked = [...new Set(fiscalDocumentIds)];
  if (asked.length === 0) {
    return [];
  }
  const recorded = await unclearDeferrals.recordedOutcomesOf(registerId, asked);
  return asked.map((fiscalDocumentId) => {
    const outcome = recorded.find((candidate) => candidate.fiscalDocumentId === fiscalDocumentId);
    return {
      fiscalDocumentId,
      answer: restoredUnclearDeferralAnswer(outcome?.outcome ?? null, {
        answeredAt: outcome?.answeredAt ?? null,
        decidedAt: outcome?.decidedAt ?? null,
      }),
    };
  });
}
