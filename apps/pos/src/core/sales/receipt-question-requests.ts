import type { AnswerReceiptQuestionOutcome } from "@purosur/contracts";
import { declineSaleReceipt, receiptQuestionOf } from "@purosur/domain/sales/use-cases";
import { printCompletedSaleReceiptFor, type ReceiptRequestDeps } from "./receipt-requests";
import { SqliteReceiptLedger } from "./sqlite-receipt-ledger";

export interface ReceiptAnswer {
  saleId: string;
  print: boolean;
}

export type ReceiptAnswerOutcome = Exclude<AnswerReceiptQuestionOutcome, { kind: "unavailable" }>;

export function saleAsksBeforePrinting(
  { database }: Pick<ReceiptRequestDeps, "database">,
  saleId: string,
): boolean {
  return (
    receiptQuestionOf({ ledger: new SqliteReceiptLedger(database) }, { saleId }).kind === "asks"
  );
}

function declineHeld(deps: ReceiptRequestDeps, saleId: string) {
  try {
    return declineSaleReceipt(
      { ledger: new SqliteReceiptLedger(deps.database), clock: { now: deps.now } },
      { saleId },
    );
  } catch (error) {
    deps.jobs.holdForAnswer(saleId);
    throw error;
  }
}

export async function answerReceiptQuestionFor(
  deps: ReceiptRequestDeps,
  syncNow: () => void,
  { saleId, print }: ReceiptAnswer,
): Promise<ReceiptAnswerOutcome> {
  if (deps.signedInUserId() === undefined) {
    return { kind: "not_signed_in" };
  }
  if (!deps.jobs.releaseAnswer(saleId)) {
    return { kind: "not_awaiting" };
  }
  if (print) {
    try {
      await printCompletedSaleReceiptFor(deps, saleId);
    } catch (error) {
      deps.jobs.holdForAnswer(saleId);
      throw error;
    }
    syncNow();
    return { kind: "printing" };
  }
  const declined = declineHeld(deps, saleId);
  if (declined.kind === "declined") {
    syncNow();
  }
  return declined;
}
