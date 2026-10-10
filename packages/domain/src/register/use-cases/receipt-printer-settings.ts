import type { ReceiptPrinterAddress } from "../model/receipt-printer-address.js";

export interface ReceiptPrinterSettings {
  receiptPrinterAddress(): ReceiptPrinterAddress | undefined;
  saveReceiptPrinterAddress(address: ReceiptPrinterAddress): void;
}
