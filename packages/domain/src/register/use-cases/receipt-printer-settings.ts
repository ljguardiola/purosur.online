import type { ReceiptPrinterAddress } from "../model/receipt-printer-address.js";

export interface ReceiptPrinterSettings {
  receiptPrinterAddress(): ReceiptPrinterAddress | undefined;
  isCurrentReceiptPrinter(address: ReceiptPrinterAddress): boolean;
  saveReceiptPrinterAddress(address: ReceiptPrinterAddress): void;
}
