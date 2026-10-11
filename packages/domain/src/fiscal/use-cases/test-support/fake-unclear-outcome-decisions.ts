import type {
  UnclearDocumentSettled,
  UnclearFiscalDocuments,
  UnclearOutcomeAnswer,
  UnclearOutcomeCloud,
  UnclearOutcomeQuestion,
} from "../apply-unclear-outcome-decision-ports.js";
import type { WaitingFiscalDocument } from "../real-time-authorization-ports.js";

export class FakeUnclearFiscalDocuments implements UnclearFiscalDocuments {
  settlements: readonly UnclearDocumentSettled[] = [];
  failOnDocument: string | undefined;
  private readonly unclear: readonly WaitingFiscalDocument[];

  constructor(unclear: readonly WaitingFiscalDocument[]) {
    this.unclear = unclear;
  }

  async unclearDocuments(): Promise<readonly WaitingFiscalDocument[]> {
    return this.unclear;
  }

  async settle(settled: UnclearDocumentSettled): Promise<void> {
    if (settled.fiscalDocumentId === this.failOnDocument) {
      throw new Error(`settling  failed`);
    }
    this.settlements = [...this.settlements, settled];
  }
}

export class FakeUnclearOutcomeCloud implements UnclearOutcomeCloud {
  questions: readonly UnclearOutcomeQuestion[] = [];
  private readonly answers: ReadonlyMap<string, UnclearOutcomeAnswer>;

  constructor(answers: ReadonlyMap<string, UnclearOutcomeAnswer>) {
    this.answers = answers;
  }

  async outcomeOf(question: UnclearOutcomeQuestion): Promise<UnclearOutcomeAnswer> {
    this.questions = [...this.questions, question];
    return this.answers.get(question.fiscalDocumentId) ?? { kind: "no_answer" };
  }
}
