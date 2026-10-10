// The tax authority's point-of-sale number is at most five digits.
export const POINT_OF_SALE_NUMBER_MAX = 99999;

export function isPointOfSaleNumber(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= POINT_OF_SALE_NUMBER_MAX;
}

export type PointOfSaleMechanism = "real_time" | "offline";

export interface PointOfSaleHolder {
  registerId: string;
  mechanism: PointOfSaleMechanism;
}

export function mayRegisterClaimPointOfSale(
  holder: PointOfSaleHolder | undefined,
  registerId: string,
  mechanism: PointOfSaleMechanism,
): boolean {
  return (
    holder === undefined || (holder.registerId === registerId && holder.mechanism === mechanism)
  );
}
