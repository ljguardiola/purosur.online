import { completedSaleId } from "../platform/completed-sale-id";

export interface AuthorizingCompletedSalesDeps {
  authorizeSale: (saleId: string) => Promise<unknown>;
  onFailure: (error: unknown) => void;
}

export function authorizingCompletedSales<TRequest, TOutcome extends { kind: string }>(
  { authorizeSale, onFailure }: AuthorizingCompletedSalesDeps,
  charge: (request: TRequest) => Promise<TOutcome>,
): (request: TRequest) => Promise<TOutcome> {
  return async (request) => {
    const outcome = await charge(request);
    const saleId = completedSaleId(outcome);
    if (saleId !== undefined) {
      authorizeSale(saleId).catch(onFailure);
    }
    return outcome;
  };
}
