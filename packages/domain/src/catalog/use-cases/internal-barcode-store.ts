export interface InternalBarcodeStore {
  nextInternalBarcodeBody(): Promise<bigint>;
  isBarcodeAssigned(code: string): Promise<boolean>;
}
