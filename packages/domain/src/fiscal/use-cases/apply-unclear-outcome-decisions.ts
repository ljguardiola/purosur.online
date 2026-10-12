import { unclearDocumentSettlement } from "../model/unclear-outcome-decision.js";
import type { ApplyUnclearOutcomeDecisionsPorts } from "./apply-unclear-outcome-decision-ports.js";
import type { WaitingFiscalDocument } from "./real-time-authorization-ports.js";

interface UnclearOutcomeDecisionFailure {
  fiscalDocumentId: string;
  error: unknown;
}

export interface ApplyUnclearOutcomeDecisionsOutcome {
  kind: "applied";
  settled: readonly string[];
  stillUnclear: readonly string[];
  failed: readonly UnclearOutcomeDecisionFailure[];
}

type DocumentResult = "settled" | "still_unclear";

export async function applyUnclearOutcomeDecisions({
  documents,
  cloud,
  clock,
}: ApplyUnclearOutcomeDecisionsPorts): Promise<ApplyUnclearOutcomeDecisionsOutcome> {
  async function applyTo({
    saleEvent,
    ...document
  }: WaitingFiscalDocument): Promise<DocumentResult> {
    if (saleEvent === null) {
      throw new Error("the completion event of the unclear document's sale is not held");
    }
    const told = await cloud.outcomeOf({ ...document, saleEvent });
    if (told.kind === "pending" || told.kind === "no_answer") {
      return "still_unclear";
    }
    await documents.settle({
      fiscalDocumentId: document.fiscalDocumentId,
      saleId: document.saleId,
      settlement: unclearDocumentSettlement(told),
      settledAt: clock.now(),
    });
    return "settled";
  }

  const settled: string[] = [];
  const stillUnclear: string[] = [];
  const failed: UnclearOutcomeDecisionFailure[] = [];
  for (const document of await documents.unclearDocuments()) {
    try {
      const result = await applyTo(document);
      (result === "settled" ? settled : stillUnclear).push(document.fiscalDocumentId);
    } catch (error) {
      failed.push({ fiscalDocumentId: document.fiscalDocumentId, error });
    }
  }
  return { kind: "applied", settled, stillUnclear, failed };
}
