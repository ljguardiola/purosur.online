import {
  ARGENTINA_TIME_ZONE,
  type DiscountBenefit,
  type ReceiptContent,
  type ReceiptCopy,
  STOCK_QUANTITY_DECIMALS,
  STOCK_QUANTITY_PER_UNIT,
} from "@purosur/domain";
import type { ReceiptTemplate, StoredReceipt } from "@purosur/domain/sales/use-cases";
import { formatCents, formatDate, formatNumber } from "@purosur/ui/formatters";
import { encodePc850 } from "./pc850";
import { RECEIPT_LOGO } from "./receipt-logo";

const TEMPLATE_VERSION = "1";
const COLUMNS = 48;
const OPERATION_NUMBER_DIGITS = 6;
const RULE = "─".repeat(COLUMNS);
const FEED_LINES = 5;
const PC850_TABLE = 2;
const ESC = 0x1b;
const GS = 0x1d;
const LINE_FEED = 0x0a;

const PAYMENT_NAMES = { CASH: "Efectivo", TRANSFER: "Transferencia" } as const;

class Output {
  private readonly chunks: Uint8Array[] = [];

  command(...bytes: number[]): void {
    this.chunks.push(Uint8Array.from(bytes));
  }

  raw(bytes: Uint8Array): void {
    this.chunks.push(bytes);
  }

  lines(lines: readonly string[]): void {
    for (const line of lines) {
      this.chunks.push(encodePc850(line), Uint8Array.of(LINE_FEED));
    }
  }

  bold(lines: readonly string[]): void {
    for (const line of lines) {
      this.command(ESC, 0x45, 1);
      this.chunks.push(encodePc850(line));
      this.command(ESC, 0x45, 0);
      this.chunks.push(Uint8Array.of(LINE_FEED));
    }
  }

  bytes(): Uint8Array {
    return concatenated(this.chunks);
  }
}

function concatenated(chunks: readonly Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

function wrapped(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (let word of text.split(" ")) {
    while (word.length > width) {
      if (current !== "") {
        lines.push(current);
        current = "";
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (current === "") {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function centered(text: string): string[] {
  return wrapped(text, COLUMNS).map(
    (line) => " ".repeat(Math.floor((COLUMNS - line.length) / 2)) + line,
  );
}

function row(left: string, right: string, indent = ""): string[] {
  const room = Math.max(1, COLUMNS - indent.length - right.length - 1);
  const lines = wrapped(left, room).map((line) => indent + line);
  const last = lines.pop() ?? indent;
  return [...lines, last + " ".repeat(Math.max(1, COLUMNS - last.length - right.length)) + right];
}

function initialization(out: Output): void {
  out.command(ESC, 0x40);
  out.command(ESC, 0x74, PC850_TABLE);
}

function logo(out: Output): void {
  const { widthDots, heightDots, rows } = RECEIPT_LOGO;
  const widthBytes = widthDots / 8;
  out.command(
    GS,
    0x76,
    0x30,
    0,
    widthBytes & 0xff,
    widthBytes >> 8,
    heightDots & 0xff,
    heightDots >> 8,
  );
  out.raw(concatenated(rows.map((encoded) => Uint8Array.from(Buffer.from(encoded, "base64")))));
}

function branch(
  out: Output,
  { address, whatsappNumber, instagramHandle }: ReceiptContent["header"],
): void {
  out.lines([
    ...centered(address),
    ...centered(`WhatsApp ${whatsappNumber}  ·  ${instagramHandle}`),
    RULE,
  ]);
}

function operation(
  out: Output,
  { occurredAt, servedByFirstName, operationNumber }: ReceiptContent["operation"],
): void {
  const date = formatDate(occurredAt, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ARGENTINA_TIME_ZONE,
  });
  const time = formatDate(occurredAt, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: ARGENTINA_TIME_ZONE,
  });
  const number = formatNumber(operationNumber, {
    minimumIntegerDigits: OPERATION_NUMBER_DIGITS,
    useGrouping: false,
  });
  out.lines([
    ...row(`Fecha ${date}`, `Hora ${time}`),
    ...row(`Operación ${number}`, `Atendió ${servedByFirstName}`),
    RULE,
  ]);
}

function promotionText(promotion: DiscountBenefit | null): string {
  if (promotion === null) {
    return "Descuento";
  }
  return promotion.kind === "PERCENT_OFF"
    ? `${formatNumber(promotion.percent)} % de descuento`
    : `Lleve ${formatNumber(promotion.buyQty)}, pague ${formatNumber(promotion.payQty)}`;
}

function weightText(thousandths: number): string {
  return formatNumber(thousandths / STOCK_QUANTITY_PER_UNIT, {
    minimumFractionDigits: STOCK_QUANTITY_DECIMALS,
    maximumFractionDigits: STOCK_QUANTITY_DECIMALS,
  });
}

function saleLine(line: ReceiptContent["lines"][number]): string[] {
  const amount = formatCents(line.lineTotal + line.discountAmount);
  if (line.saleUnit === "UNIT" && line.quantity === 1 && line.discountAmount === 0) {
    return row(line.productName, amount);
  }
  const price = formatCents(line.listUnitPrice);
  const detail =
    line.saleUnit === "KG"
      ? `${weightText(line.quantity)} kg x ${price} el kg`
      : `${formatNumber(line.quantity)} x ${price}`;
  return [
    ...wrapped(line.productName, COLUMNS),
    ...row(detail, amount, "  "),
    ...(line.discountAmount > 0
      ? row(promotionText(line.promotion), `-${formatCents(line.discountAmount)}`, "  ")
      : []),
  ];
}

function sale(out: Output, { lines, totals }: Pick<ReceiptContent, "lines" | "totals">): void {
  out.lines([
    ...row("PRODUCTO", "IMPORTE"),
    ...lines.flatMap(saleLine),
    RULE,
    ...row("Subtotal", formatCents(totals.subtotal)),
    RULE,
  ]);
  out.bold(row("TOTAL", formatCents(totals.total)));
  out.lines([
    RULE,
    ...totals.payments.flatMap(({ method, amount }) =>
      row(PAYMENT_NAMES[method], formatCents(amount)),
    ),
    ...(totals.change > 0 ? row("Vuelto", formatCents(totals.change)) : []),
    RULE,
  ]);
}

function closing(out: Output): void {
  out.lines([
    ...centered("Gracias por tu compra"),
    ...centered("Cambios y devoluciones solo con este ticket."),
  ]);
  out.command(ESC, 0x64, FEED_LINES);
  out.command(GS, 0x56, 1);
}

const DUPLICATE_LEGENDS: Record<string, (orderNumber: number) => Uint8Array> = {
  [TEMPLATE_VERSION]: (orderNumber) => {
    const out = new Output();
    out.bold(centered(`COPIA DUPLICADA Nº ${orderNumber}`));
    return out.bytes();
  },
};

function render(content: ReceiptContent): StoredReceipt {
  const head = new Output();
  initialization(head);
  logo(head);
  branch(head, content.header);
  operation(head, content.operation);
  const body = new Output();
  sale(body, content);
  closing(body);
  return { templateVersion: TEMPLATE_VERSION, head: head.bytes(), body: body.bytes() };
}

function printable(stored: StoredReceipt, copy: ReceiptCopy): Uint8Array {
  if (copy.kind === "original") {
    return concatenated([stored.head, stored.body]);
  }
  const legend = DUPLICATE_LEGENDS[stored.templateVersion];
  if (legend === undefined) {
    throw new Error(`unknown receipt template version ${stored.templateVersion}`);
  }
  return concatenated([stored.head, legend(copy.orderNumber), stored.body]);
}

export const escPosReceiptTemplate: ReceiptTemplate = { render, printable };
