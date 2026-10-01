import { appendEan13CheckDigit } from "../model/ean13.js";
import type { InternalBarcodeStore } from "./internal-barcode-store.js";

export type AllocateInternalBarcodeOutcome = { kind: "allocated"; code: string };

export async function allocateInternalBarcode(
  store: InternalBarcodeStore,
): Promise<AllocateInternalBarcodeOutcome> {
  for (;;) {
    const value = await store.nextSequenceValue();
    const code = appendEan13CheckDigit(value.toString());
    if (!(await store.isBarcodeAssigned(code))) {
      return { kind: "allocated", code };
    }
  }
}
