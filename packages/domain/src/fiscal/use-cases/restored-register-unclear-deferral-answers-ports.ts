import type { RecordedRequestOutcome } from "../model/unclear-outcome-decision.js";

export interface RecordedUnclearOutcomeOfRegister {
  fiscalDocumentId: string;
  outcome: RecordedRequestOutcome;
  answeredAt: Date | null;
  decidedAt: Date | null;
}

export interface RestoredRegisterUnclearDeferralAnswers {
  recordedOutcomesOf(
    registerId: string,
    fiscalDocumentIds: readonly string[],
  ): Promise<RecordedUnclearOutcomeOfRegister[]>;
}

export interface ServeRestoredRegisterUnclearDeferralAnswersPorts {
  unclearDeferrals: RestoredRegisterUnclearDeferralAnswers;
}
