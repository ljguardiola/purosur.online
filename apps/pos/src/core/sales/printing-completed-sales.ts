import { completedSaleId } from "../platform/completed-sale-id";

export interface PrintingCompletedSalesDeps {
  beforePrinting: (saleId: string) => Promise<void>;
  print: (saleId: string) => Promise<void>;
  syncNow: () => void;
  onFailure: (error: unknown) => void;
}

interface ReceiptQuestionDeps {
  prepare: (saleId: string) => void;
  endPreparing: (saleId: string) => void;
  asksBeforePrinting: (saleId: string) => boolean;
  holdForAnswer: (saleId: string) => void;
}

export interface AskingCompletedSalesDeps extends PrintingCompletedSalesDeps {
  question: ReceiptQuestionDeps;
}

function printCompletedSale(
  { beforePrinting, print, syncNow, onFailure }: PrintingCompletedSalesDeps,
  outcome: { kind: string },
  question?: ReceiptQuestionDeps,
): void {
  const saleId = completedSaleId(outcome);
  if (saleId !== undefined) {
    question?.prepare(saleId);
    beforePrinting(saleId)
      .catch(onFailure)
      .then(async () => {
        if (question?.asksBeforePrinting(saleId)) {
          question.holdForAnswer(saleId);
          return;
        }
        await print(saleId);
      })
      .catch(onFailure)
      .finally(() => {
        question?.endPreparing(saleId);
        syncNow();
      });
  }
}

export function printingCompletedSales<TRequest, TOutcome extends { kind: string }>(
  deps: AskingCompletedSalesDeps,
  charge: (request: TRequest) => Promise<TOutcome>,
): (request: TRequest) => Promise<TOutcome> {
  return async (request) => {
    const outcome = await charge(request);
    printCompletedSale(deps, outcome, deps.question);
    return outcome;
  };
}

export function printingEachCompletedSale<
  TRequest,
  TFollowed extends { followed: { outcome: { kind: string } }[] },
>(
  deps: PrintingCompletedSalesDeps,
  follow: (request: TRequest) => Promise<TFollowed>,
): (request: TRequest) => Promise<TFollowed> {
  return async (request) => {
    const followed = await follow(request);
    for (const { outcome } of followed.followed) {
      printCompletedSale(deps, outcome);
    }
    return followed;
  };
}
