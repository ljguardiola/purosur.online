export function isListedInStockBalances(params: { active: boolean; balance: number }): boolean {
  return params.active || params.balance !== 0;
}
