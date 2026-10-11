import { completedSaleId } from "../platform/completed-sale-id";

export interface PrintingCompletedSalesDeps {
  beforePrinting: (saleId: string) => Promise<void>;
  print: (saleId: string) => Promise<void>;
  syncNow: () => void;
  onFailure: (error: unknown) => void;
}

export function printingCompletedSales<TRequest, TOutcome extends { kind: string }>(
  { beforePrinting, print, syncNow, onFailure }: PrintingCompletedSalesDeps,
  charge: (request: TRequest) => Promise<TOutcome>,
): (request: TRequest) => Promise<TOutcome> {
  return async (request) => {
    const outcome = await charge(request);
    const saleId = completedSaleId(outcome);
    if (saleId !== undefined) {
      beforePrinting(saleId)
        .catch(onFailure)
        .then(() => print(saleId))
        .catch(onFailure)
        .finally(syncNow);
    }
    return outcome;
  };
}
