import type { InternalBarcodeStore } from "../internal-barcode-store.js";

export class FakeInternalBarcodeStore implements InternalBarcodeStore {
  private nextValue: bigint;
  private readonly assignedCodes: ReadonlySet<string>;
  readonly checkedCodes: string[] = [];

  constructor(input: { nextValue: bigint; assignedCodes?: string[] }) {
    this.nextValue = input.nextValue;
    this.assignedCodes = new Set(input.assignedCodes ?? []);
  }

  async nextInternalBarcodeBody(): Promise<bigint> {
    const value = this.nextValue;
    this.nextValue += 1n;
    return value;
  }

  async isBarcodeAssigned(code: string): Promise<boolean> {
    this.checkedCodes.push(code);
    return this.assignedCodes.has(code);
  }
}
