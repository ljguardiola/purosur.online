import type { ReceiptPrinterAddress } from "../../model/receipt-printer-address.js";
import type { ReceiptPrinterSettings } from "../receipt-printer-settings.js";

export class FakeReceiptPrinterSettings implements ReceiptPrinterSettings {
  reads = 0;
  saves = 0;
  private address: ReceiptPrinterAddress | undefined;

  constructor(address?: ReceiptPrinterAddress) {
    this.address = address;
  }

  receiptPrinterAddress(): ReceiptPrinterAddress | undefined {
    this.reads += 1;
    return this.address;
  }

  saveReceiptPrinterAddress(address: ReceiptPrinterAddress): void {
    this.saves += 1;
    this.address = address;
  }
}
