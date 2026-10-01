// The tax authority's point-of-sale number is at most five digits.
export const POINT_OF_SALE_NUMBER_MAX = 99999;

export function isPointOfSaleNumber(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= POINT_OF_SALE_NUMBER_MAX;
}

export function mayRegisterClaimPointOfSale(
  holderRegisterId: string | undefined,
  registerId: string,
): boolean {
  return holderRegisterId === undefined || holderRegisterId === registerId;
}
