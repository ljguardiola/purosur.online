import type { ReceiptPrinterReplacement } from "../receipt-printer-replacement.js";
import type { FakeReceiptPrinterSettings } from "./fake-receipt-printer-settings.js";

export class FakeReceiptPrinterReplacement implements ReceiptPrinterReplacement {
  savesSeenAtEachReplacement: number[] = [];
  private readonly settings: FakeReceiptPrinterSettings;

  constructor(settings: FakeReceiptPrinterSettings) {
    this.settings = settings;
  }

  receiptPrinterReplaced(): void {
    this.savesSeenAtEachReplacement.push(this.settings.saves);
  }
}
