import type { SalesCoreToRendererMessage } from "@purosur/contracts";
import { receiptAsksBeforePrinting, receiptContent, salePrintStanding } from "@purosur/domain";
import { declineSaleReceipt } from "@purosur/domain/sales/use-cases";
import { printCompletedSaleReceiptFor, type ReceiptRequestDeps } from "./receipt-requests";
import { SqliteReceiptLedger } from "./sqlite-receipt-ledger";

export interface ReceiptAnswer {
  saleId: string;
  print: boolean;
}

export type AnswerReceiptQuestionOutcome = Extract<
  SalesCoreToRendererMessage,
  { type: "answer-receipt-question-result" }
>["outcome"];

export type ReceiptAnswerOutcome = Exclude<AnswerReceiptQuestionOutcome, { kind: "unavailable" }>;

export function saleAsksBeforePrinting(
  { database }: Pick<ReceiptRequestDeps, "database">,
  saleId: string,
): boolean {
  return new SqliteReceiptLedger(database).transaction((tx) => {
    const delivery = tx.receiptDelivery({ document: "sale_receipt", saleId });
    return (
      delivery !== undefined &&
      salePrintStanding(delivery) === "never_printed" &&
      receiptAsksBeforePrinting(receiptContent(tx.receiptSource(saleId)).fiscal)
    );
  });
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
  const declined = declineSaleReceipt(
    { ledger: new SqliteReceiptLedger(deps.database), clock: { now: deps.now } },
    { saleId },
  );
  if (declined.kind === "declined") {
    syncNow();
    return { kind: "declined" };
  }
  return declined.kind === "not_found" ? { kind: "not_found" } : { kind: "not_awaiting" };
}
