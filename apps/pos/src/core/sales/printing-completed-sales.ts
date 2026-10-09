import { completedSaleId } from "../fiscal/authorizing-completed-sales";

export interface PrintingCompletedSalesDeps {
  print: (saleId: string) => Promise<void>;
  syncNow: () => void;
  onFailure: (error: unknown) => void;
}

export function printingCompletedSales<TRequest, TOutcome extends { kind: string }>(
  { print, syncNow, onFailure }: PrintingCompletedSalesDeps,
  charge: (request: TRequest) => Promise<TOutcome>,
): (request: TRequest) => Promise<TOutcome> {
  return async (request) => {
    const outcome = await charge(request);
    const saleId = completedSaleId(outcome);
    if (saleId !== undefined) {
      print(saleId).catch(onFailure).finally(syncNow);
    }
    return outcome;
  };
}
