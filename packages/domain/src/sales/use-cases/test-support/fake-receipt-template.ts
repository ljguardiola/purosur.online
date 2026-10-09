import type { ReceiptContent } from "../../model/receipt-content.js";
import type { ReceiptCopy } from "../../model/receipt-copy.js";
import type { ReceiptTemplate, StoredReceipt } from "../receipt-ports.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function textOf(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export class FakeReceiptTemplate implements ReceiptTemplate {
  version = "v1";
  renders: ReceiptContent[] = [];

  render(content: ReceiptContent): StoredReceipt {
    this.renders.push(content);
    return {
      templateVersion: this.version,
      head: encoder.encode(`HEAD[${this.version}] total ${content.totals.total}\n`),
      body: encoder.encode(`BODY ${content.lines.length} lines\n`),
    };
  }

  printable(stored: StoredReceipt, copy: ReceiptCopy): Uint8Array {
    const legend = copy.kind === "original" ? "" : `DUPLICATE ${copy.orderNumber}\n`;
    return encoder.encode(`${textOf(stored.head)}${legend}${textOf(stored.body)}`);
  }
}
