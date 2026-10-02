import { appendEan13CheckDigit, isInternalBarcode } from "../model/ean13.js";
import type { InternalBarcodeStore } from "./internal-barcode-store.js";

export type AllocateInternalBarcodeOutcome = { kind: "allocated"; code: string };

export async function allocateInternalBarcode(
  store: InternalBarcodeStore,
): Promise<AllocateInternalBarcodeOutcome> {
  for (;;) {
    const value = await store.nextInternalBarcodeBody();
    const code = appendEan13CheckDigit(value.toString());
    if (!isInternalBarcode(code)) {
      throw new Error("internal-barcode: the store gave a body outside the internal range");
    }
    if (!(await store.isBarcodeAssigned(code))) {
      return { kind: "allocated", code };
    }
  }
}
