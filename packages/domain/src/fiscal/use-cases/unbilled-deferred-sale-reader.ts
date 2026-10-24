export interface UnbilledDeferredSales {
  count: number;
  oldestOccurredAt: Date | null;
}

export interface UnbilledDeferredSaleReader {
  unbilledDeferredSalesOfBranch(locationId: string): Promise<UnbilledDeferredSales>;
}
