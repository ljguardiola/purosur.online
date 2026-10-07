const FETCH_INTERVAL_AFTER_A_SET_MS = 60 * 60 * 1000;
const FETCH_INTERVAL_AFTER_NO_SET_MS = 60 * 1000;

export interface BuyerTaxStatusFetchEnd {
  gotSet: boolean;
}

export function nextBuyerTaxStatusFetchAt({ gotSet }: BuyerTaxStatusFetchEnd, now: Date): Date {
  const interval = gotSet ? FETCH_INTERVAL_AFTER_A_SET_MS : FETCH_INTERVAL_AFTER_NO_SET_MS;
  return new Date(now.getTime() + interval);
}
