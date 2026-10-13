import { completedSaleId } from "../platform/completed-sale-id";

export interface PrintingCompletedSalesDeps {
  beforePrinting: (saleId: string) => Promise<void>;
  print: (saleId: string) => Promise<void>;
  syncNow: () => void;
  onFailure: (error: unknown) => void;
}

function printCompletedSale(
  { beforePrinting, print, syncNow, onFailure }: PrintingCompletedSalesDeps,
  outcome: { kind: string },
): void {
  const saleId = completedSaleId(outcome);
  if (saleId !== undefined) {
    beforePrinting(saleId)
      .catch(onFailure)
      .then(() => print(saleId))
      .catch(onFailure)
      .finally(syncNow);
  }
}

export function printingCompletedSales<TRequest, TOutcome extends { kind: string }>(
  deps: PrintingCompletedSalesDeps,
  charge: (request: TRequest) => Promise<TOutcome>,
): (request: TRequest) => Promise<TOutcome> {
  return async (request) => {
    const outcome = await charge(request);
    printCompletedSale(deps, outcome);
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
