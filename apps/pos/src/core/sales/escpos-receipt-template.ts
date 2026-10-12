import {
  ARGENTINA_TIME_ZONE,
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
  formatPercent,
  formatPointOfSaleNumber,
} from "@purosur/ui/formatters";
import { encodePc850 } from "./pc850";
import { RECEIPT_LOGO } from "./receipt-logo";

const TEMPLATE_VERSION = "1";
const COLUMNS = 48;
const SMALL_COLUMNS = 64;
const RULE = "─".repeat(COLUMNS);
const FEED_LINES = 5;
const PC850_TABLE = 2;
const ESC = 0x1b;
const GS = 0x1d;
const LINE_FEED = 0x0a;
const QR_SIDE_DOTS = 244;
const QR_MAX_MODULE_DOTS = 16;
const QR_CORRECTION_LEVEL_L = 0x30;
const QR_BYTE_CAPACITY_AT_LEVEL_L = [
  17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858,
  929, 1003, 1091, 1171, 1273, 1367, 1465, 1528, 1628, 1732, 1840, 1952, 2068, 2188, 2303, 2431,
  2563, 2699, 2809, 2953,
];
const QR_TOP_MARGIN_DOTS = 16;
const QR_BOTTOM_MARGIN_DOTS = 8;
const QR_STORE_OVERHEAD = 3;
const CENTER_ALIGNMENT = 1;
const LEFT_ALIGNMENT = 0;
const VOUCHER_CODE_DIGITS = 3;
const LOGO_TOP_MARGIN_DOTS = 24;
const LOGO_BOTTOM_MARGIN_DOTS = 16;

const PAYMENT_NAMES = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  QR: "QR Mercado Pago",
  POINT: "Terminal Mercado Pago",
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

  small(lines: readonly string[]): void {
    for (const line of lines) {
      this.command(ESC, 0x4d, 1);
      this.chunks.push(encodePc850(line));
      this.command(ESC, 0x4d, 0);
      this.chunks.push(Uint8Array.of(LINE_FEED));
    }
  }

  qr(text: string): void {
    const data = encodePc850(text);
    const stored = data.length + QR_STORE_OVERHEAD;
    this.command(ESC, 0x61, CENTER_ALIGNMENT);
    this.command(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0);
    this.command(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, qrModuleDots(data.length));
    this.command(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, QR_CORRECTION_LEVEL_L);
    this.command(GS, 0x28, 0x6b, stored & 0xff, stored >> 8, 0x31, 0x50, 0x30);
    this.chunks.push(data);
    this.command(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30);
    this.command(ESC, 0x61, LEFT_ALIGNMENT);
  }

  feed(dots: number): void {
    this.command(ESC, 0x4a, dots);
  }

  bytes(): Uint8Array {
    return concatenated(this.chunks);
  }
}

function qrModuleDots(bytes: number): number {
  const version = QR_BYTE_CAPACITY_AT_LEVEL_L.findIndex((capacity) => bytes <= capacity) + 1;
  const modules = 17 + 4 * (version === 0 ? QR_BYTE_CAPACITY_AT_LEVEL_L.length : version);
  const nearest = Math.round(QR_SIDE_DOTS / modules);
  return Math.min(Math.max(nearest, 1), QR_MAX_MODULE_DOTS);
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

function centered(text: string, width = COLUMNS): string[] {
  return wrapped(text, width).map(
    (line) => " ".repeat(Math.floor((width - line.length) / 2)) + line,
  );
}

function row(left: string, right: string, indent = "", width = COLUMNS): string[] {
  const room = width - indent.length - right.length - 1;
  if (room < width / 2) {
    return [
      ...wrapped(left, width - indent.length).map((line) => indent + line),
      ...wrapped(right, width).map((line) => line.padStart(width)),
    ];
  }
  const lines = wrapped(left, room).map((line) => indent + line);
  const last = lines.pop() ?? indent;
  return [...lines, last + " ".repeat(width - last.length - right.length) + right];
}

function smallRow(left: string, right: string): string[] {
  return row(left, right, "", SMALL_COLUMNS);
}

function initialization(out: Output): void {
  out.command(ESC, 0x40);
  out.command(ESC, 0x74, PC850_TABLE);
}

function logo(out: Output): void {
  const { widthDots, heightDots, rows } = RECEIPT_LOGO;
  const widthBytes = widthDots / 8;
  out.feed(LOGO_TOP_MARGIN_DOTS);
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
  out.feed(LOGO_BOTTOM_MARGIN_DOTS);
}

function branch(
  out: Output,
  { address, whatsappNumber, instagramHandle }: ReceiptContent["header"],
): void {
  out.small([
    ...centered(address, SMALL_COLUMNS),
    ...centered(`WhatsApp ${whatsappNumber}  ·  ${instagramHandle}`, SMALL_COLUMNS),
  ]);
}

function voucherType(out: Output, block: FacturaCFiscalBlock): void {
  const code = String(block.voucherTypeCode).padStart(VOUCHER_CODE_DIGITS, "0");
  const buyer = block.buyerTaxStatusDescription.toLocaleLowerCase("es-AR");
  out.lines([RULE]);
  out.bold(centered(`FACTURA ${block.invoiceClass}`));
  out.small(centered(`Cód. ${code}  ·  A ${buyer}`, SMALL_COLUMNS));
}

function operation(
  out: Output,
  { occurredAt, servedByFirstName, operationNumber }: ReceiptContent["operation"],
  block: FacturaCFiscalBlock | null,
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
    RULE,
    ...(block === null
      ? []
      : row(
          `Punto de venta ${formatPointOfSaleNumber(block.pointOfSale)}`,
          `Nº ${formatInvoiceNumber(block.number)}`,
        )),
    ...row(`Fecha ${date}`, `Hora ${time}`),
    ...row(
      `Operación ${formatOperationNumber(operationNumber)}`,
      `Atendió ${servedByFirstName.trim().split(/\s+/)[0]}`,
    ),
    RULE,
  ]);
}

function issuer(out: Output, { issuer }: FacturaCFiscalBlock): void {
  out.small([
    ...smallRow(issuer.legalName, issuer.taxStatus),
    ...smallRow(`CUIT ${issuer.cuit}`, `IIBB ${issuer.grossIncomeRegistration}`),
    ...wrapped(`Inicio de actividades ${calendarDay(issuer.activityStartDate)}`, SMALL_COLUMNS),
  ]);
  out.lines([RULE]);
}

function discountText({ manualAdjustment, promotion }: ReceiptContent["lines"][number]): string {
  if (manualAdjustment?.kind === "PERCENT") {
    return `Descuento manual ${formatPercent(manualAdjustment.percent)}`;
  }
  if (manualAdjustment?.kind === "AMOUNT") {
    return "Descuento manual";
  }
  if (promotion === null) {
    return "Descuento";
  }
  return promotion.kind === "PERCENT_OFF"
    ? `${formatPercent(promotion.percent)} de descuento`
    : `Lleve ${formatNumber(promotion.buyQty)}, pague ${formatNumber(promotion.payQty)}`;
}

function saleDiscountText(discount: NonNullable<ReceiptContent["totals"]["saleDiscount"]>): string {
  return discount.kind === "PERCENT"
    ? `Descuento sobre el total ${formatPercent(discount.percent)}`
    : "Descuento sobre el total";
}

function weightText(thousandths: number): string {
  return formatNumber(thousandths / STOCK_QUANTITY_PER_UNIT, {
    minimumFractionDigits: STOCK_QUANTITY_DECIMALS,
    maximumFractionDigits: STOCK_QUANTITY_DECIMALS,
  });
}

function saleLine(line: ReceiptContent["lines"][number]): string[] {
  const amount = formatCents(line.lineTotal + line.discountAmount);
  const price = formatCents(line.chargedUnitPrice);
  const detail =
    line.saleUnit === "KG"
      ? `${weightText(line.quantity)} kg x ${price} el kg`
      : `${formatNumber(line.quantity)} x ${price}`;
  return [
    ...(line.saleUnit === "UNIT" && line.quantity === 1
      ? row(line.productName, amount)
      : [...wrapped(line.productName, COLUMNS), ...row(detail, amount, "  ")]),
    ...(line.manualAdjustment?.kind === "PRICE" ? ["  Precio modificado"] : []),
    ...(line.discountAmount > 0
      ? row(discountText(line), `-${formatCents(line.discountAmount)}`, "  ")
      : []),
  ];
}

function sale(out: Output, { lines, totals }: Pick<ReceiptContent, "lines" | "totals">): void {
  out.bold(row("PRODUCTO", "IMPORTE"));
  out.lines([
    ...lines.flatMap(saleLine),
    RULE,
    ...row("Subtotal", formatCents(totals.subtotal)),
    ...(totals.saleDiscount === null
      ? []
      : row(saleDiscountText(totals.saleDiscount), `-${formatCents(totals.saleDiscount.amount)}`)),
    RULE,
  ]);
  out.bold(row("TOTAL", formatCents(totals.total)));
  out.lines([
    RULE,
    ...totals.payments.flatMap(({ method, amount }) =>
      row(PAYMENT_NAMES[method], formatCents(amount)),
    ),
    ...(totals.change > 0 ? row("Vuelto", formatCents(totals.change)) : []),
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

function authorization(out: Output, block: FacturaCFiscalBlock): void {
  out.feed(QR_TOP_MARGIN_DOTS);
  out.qr(block.qrText);
  out.feed(QR_BOTTOM_MARGIN_DOTS);
  out.small([
    ...centered("Comprobante autorizado", SMALL_COLUMNS),
    ...centered(
      `CAE ${block.authorizationCode}  ·  Vto. ${calendarDay(block.authorizationCodeDueOn)}`,
      SMALL_COLUMNS,
    ),
  ]);
}

function closing(out: Output): void {
  out.lines([RULE]);
  out.bold(centered("Gracias por tu compra"));
  out.small(centered("Cambios y devoluciones solo con este ticket.", SMALL_COLUMNS));
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
  if (content.fiscal !== null) {
    voucherType(head, content.fiscal);
  }
  const body = new Output();
  operation(body, content.operation, content.fiscal);
  if (content.fiscal !== null) {
    issuer(body, content.fiscal);
  }
  sale(body, content);
  if (content.fiscal !== null) {
    authorization(body, content.fiscal);
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
