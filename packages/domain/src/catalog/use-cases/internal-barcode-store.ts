export interface InternalBarcodeStore {
  nextSequenceValue(): Promise<bigint>;
  isBarcodeAssigned(code: string): Promise<boolean>;
}
