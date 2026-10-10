import type { ReceiptPrinter, ReceiptPrinters } from "../receipt-ports.js";

export class FakeReceiptPrinters implements ReceiptPrinters {
  asked = 0;
  private printer: ReceiptPrinter | undefined;

  constructor(printer: ReceiptPrinter | undefined) {
    this.printer = printer;
  }

  configured(): ReceiptPrinter | undefined {
    this.asked += 1;
    return this.printer;
  }

  configure(printer: ReceiptPrinter): void {
    this.printer = printer;
  }

  unconfigure(): void {
    this.printer = undefined;
  }
}
