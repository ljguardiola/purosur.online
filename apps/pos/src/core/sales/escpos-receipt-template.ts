import {
  ARGENTINA_TIME_ZONE,
  type DiscountBenefit,
  type FacturaCFiscalBlock,
  type ReceiptContent,
  type ReceiptCopy,
  STOCK_QUANTITY_DECIMALS,
  STOCK_QUANTITY_PER_UNIT,
} from "@purosur/domain";
import type { ReceiptTemplate, StoredReceipt } from "@purosur/domain/sales/use-cases";
import {
  formatCents,
  formatDate,
  formatInvoiceNumber,
  formatNumber,
  formatOperationNumber,
  formatPointOfSaleNumber,
} from "@purosur/ui/formatters";
import { encodePc850 } from "./pc850";
import { RECEIPT_LOGO } from "./receipt-logo";

const TEMPLATE_VERSION = "1";
const COLUMNS = 48;
const RULE = "─".repeat(COLUMNS);
const FEED_LINES = 5;
const PC850_TABLE = 2;
const ESC = 0x1b;
const GS = 0x1d;
const LINE_FEED = 0x0a;
const QR_MODULE_DOTS = 4;
const QR_STORE_OVERHEAD = 3;
const CENTER_ALIGNMENT = 1;
const LEFT_ALIGNMENT = 0;
const VOUCHER_CODE_DIGITS = 3;

const PAYMENT_NAMES = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  QR: "QR Mercado Pago",
} as const;

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

  qr(text: string): void {
    const data = encodePc850(text);
    const stored = data.length + QR_STORE_OVERHEAD;
    this.command(ESC, 0x61, CENTER_ALIGNMENT);
    this.command(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0);
    this.command(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, QR_MODULE_DOTS);
    this.command(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31);
    this.command(GS, 0x28, 0x6b, stored & 0xff, stored >> 8, 0x31, 0x50, 0x30);
    this.chunks.push(data);
    this.command(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30);
    this.command(ESC, 0x61, LEFT_ALIGNMENT);
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
  out.lines([
    ...row(`Fecha ${date}`, `Hora ${time}`),
    ...row(`Operación ${formatOperationNumber(operationNumber)}`, `Atendió ${servedByFirstName}`),
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
  const price = formatCents(line.listUnitPrice);
  const detail =
    line.saleUnit === "KG"
      ? `${weightText(line.quantity)} kg x ${price} el kg`
      : `${formatNumber(line.quantity)} x ${price}`;
  return [
    ...wrapped(line.productName, COLUMNS),
    ...row(detail, amount, "  "),
    ...(line.discountAmount > 0
      ? [
          ...row(promotionText(line.promotion), `-${formatCents(line.discountAmount)}`, "  "),
          ...row("Total de la línea", formatCents(line.lineTotal), "  "),
        ]
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

function calendarDay(day: string): string {
  return formatDate(new Date(`${day}T00:00:00Z`), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fiscal(out: Output, block: FacturaCFiscalBlock): void {
  const { issuer } = block;
  out.bold(centered(`FACTURA ${block.invoiceClass}`));
  out.lines([
    ...centered(`Cód. ${String(block.voucherTypeCode).padStart(VOUCHER_CODE_DIGITS, "0")}`),
    ...centered(issuer.legalName),
    ...centered(`CUIT ${issuer.cuit}`),
    ...centered(issuer.taxStatus),
    ...centered(`Ingresos Brutos ${issuer.grossIncomeRegistration}`),
    ...centered(`Inicio de actividades ${calendarDay(issuer.activityStartDate)}`),
    RULE,
    ...row(
      `Punto de venta ${formatPointOfSaleNumber(block.pointOfSale)}`,
      `Comp. Nro ${formatInvoiceNumber(block.number)}`,
    ),
    `Fecha de emisión ${calendarDay(block.issuedOn)}`,
    ...wrapped(`Receptor: ${block.buyerTaxStatusDescription}`, COLUMNS),
    RULE,
    ...row("Importe neto", formatCents(block.netAmount)),
    ...row("IVA", formatCents(block.vatAmount)),
    RULE,
  ]);
  out.qr(block.qrText);
  out.lines([
    ...centered("Comprobante Autorizado"),
    ...centered(`CAE N° ${block.authorizationCode}`),
    ...centered(`Fecha de Vto. de CAE ${calendarDay(block.authorizationCodeDueOn)}`),
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
  if (content.fiscal !== null) {
    fiscal(body, content.fiscal);
  }
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
