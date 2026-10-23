import type {
  RecordedUnclearOutcomeOfRegister,
  RestoredRegisterUnclearDeferralAnswers,
} from "../restored-register-unclear-deferral-answers-ports.js";

export interface StoredUnclearOutcome extends RecordedUnclearOutcomeOfRegister {
  registerId: string;
}

export interface UnclearOutcomesRead {
  registerId: string;
  fiscalDocumentIds: readonly string[];
}

export class FakeRestoredRegisterUnclearDeferralAnswers
  implements RestoredRegisterUnclearDeferralAnswers
{
  outcomes: StoredUnclearOutcome[] = [];
  reads: UnclearOutcomesRead[] = [];

  async recordedOutcomesOf(
    registerId: string,
    fiscalDocumentIds: readonly string[],
  ): Promise<RecordedUnclearOutcomeOfRegister[]> {
    this.reads.push({ registerId, fiscalDocumentIds });
    return this.outcomes
      .filter(
        (outcome) =>
          outcome.registerId === registerId && fiscalDocumentIds.includes(outcome.fiscalDocumentId),
      )
      .map(({ registerId: _registerId, ...outcome }) => outcome);
  }
}
