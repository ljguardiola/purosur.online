export interface CurrentPriceReader {
  currentUnitPrices(locationId: string): Promise<Map<string, number>>;
}
