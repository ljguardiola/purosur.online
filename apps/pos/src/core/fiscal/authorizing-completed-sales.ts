export interface AuthorizingCompletedSalesDeps {
  authorizeSale: (saleId: string) => Promise<unknown>;
  onFailure: (error: unknown) => void;
}

export function completedSaleId(outcome: { kind: string }): string | undefined {
  return outcome.kind === "completed" && "sale_id" in outcome && typeof outcome.sale_id === "string"
    ? outcome.sale_id
    : undefined;
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
