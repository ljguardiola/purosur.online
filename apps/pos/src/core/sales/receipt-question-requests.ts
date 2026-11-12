import type { AnswerReceiptQuestionOutcome } from "@purosur/contracts";
import { declineSaleReceipt, receiptQuestionOf } from "@purosur/domain/sales/use-cases";
import {
  lapsedOfferReleased,
  printCompletedSaleReceiptFor,
  type ReceiptRequestDeps,
} from "./receipt-requests";
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

function declineHeld(deps: ReceiptRequestDeps, saleId: string, deadline: Date) {
  try {
    return declineSaleReceipt(
      { ledger: new SqliteReceiptLedger(deps.database), clock: { now: deps.now } },
      { saleId },
    );
  } catch (error) {
    deps.jobs.holdForAnswer(saleId, deadline);
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
  const deadline = deps.jobs.offerDeadlineOf(saleId);
  if (deadline === undefined) {
    return { kind: "not_awaiting" };
  }
  if (lapsedOfferReleased(deps, saleId)?.offer.kind === "lapsed") {
    syncNow();
    return { kind: "lapsed" };
  }
  deps.jobs.releaseAnswer(saleId);
  if (print) {
    try {
      await printCompletedSaleReceiptFor(deps, saleId);
    } catch (error) {
      deps.jobs.holdForAnswer(saleId, deadline);
      throw error;
    }
    syncNow();
    return { kind: "printing" };
  }
  const declined = declineHeld(deps, saleId, deadline);
  if (declined.kind === "declined") {
    syncNow();
  }
  return declined;
}
