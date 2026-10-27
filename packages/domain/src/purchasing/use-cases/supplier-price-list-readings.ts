export interface SupplierPriceListReadingInProgress {
  listId: string;
  // The instant the list was sent to be read, null while it has not been.
  sentAt: Date | null;
  // The instant a reading of the list last started, null while it waits for one to start.
  readingStartedAt: Date | null;
}

export interface SupplierPriceListReadings {
  listInProgress(): Promise<SupplierPriceListReadingInProgress[]>;
}
