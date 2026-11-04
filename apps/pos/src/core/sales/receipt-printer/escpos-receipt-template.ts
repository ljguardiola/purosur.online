import {
  type CreditNoteCFiscalBlock,
  type CreditNoteReceiptContent,
  type DeferredSaleDocumentBlock,
  localClock,
  type PointCardType,
  type ReceiptContent,
  type ReceiptCopy,
  STOCK_QUANTITY_DECIMALS,
  STOCK_QUANTITY_PER_UNIT,
  type ZoneRules,
  type ZoneRulesSource,
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
  formatShortCode,
} from "@purosur/ui/formatters";
import {
  COLUMNS,
  centered,
  concatenated,
  EscPosWriter,
  type RasterImage,
  RULE,
  row,
  SMALL_COLUMNS,
  wrapped,
} from "../../platform/escpos/escpos-writer";
import { RECEIPT_LOGO } from "./receipt-logo";

type InvoiceBlock = Extract<NonNullable<ReceiptContent["fiscal"]>, { invoiceClass: "C" }>;
type SaleTotals = Pick<
  ReceiptContent["totals"],
  "subtotal" | "saleDiscount" | "cashRounding" | "total"
>;
type OfflineInvoiceBlock = Extract<InvoiceBlock, { fortnight: unknown }>;

const TEMPLATE_VERSION = "3";
const QR_SIDE_DOTS = 244;
const QR_TOP_MARGIN_DOTS = 9;
const QR_BOTTOM_MARGIN_DOTS = 5;
const VOUCHER_CODE_DIGITS = 3;
const LOGO_BOTTOM_MARGIN_DOTS = 16;
const RASTER_IMAGE = Uint8Array.of(0x1d, 0x76, 0x30, 0);
const RASTER_IMAGE_HEADER_BYTES = 8;
const FEED_COMMAND = Uint8Array.of(0x1b, 0x4a);
const FEED_COMMAND_BYTES = 3;
const QR_PRINT_THEN_LEFT_ALIGNMENT = Uint8Array.of(
  0x1d,
  0x28,
  0x6b,
  3,
  0,
  0x31,
  0x51,
  0x30,
  0x1b,
  0x61,
  0,
);
const FIRST_VERSION_LOGO_START = Uint8Array.of(0x1b, 0x4a, 24, ...RASTER_IMAGE);

const REFUND_NAMES = {
  CASH: "Reintegro en efectivo",
  TRANSFER: "Reintegro por transferencia",
  QR: "Reintegro por QR de Mercado Pago",
  POINT: "Reintegro por Point integrada",
  STANDALONE_TERMINAL: "Reintegro por terminal independiente",
} as const;

const PAYMENT_NAMES = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  QR: "QR Mercado Pago",
  POINT: "Point",
  STANDALONE_TERMINAL: "Terminal independiente",
} as const;

const POINT_CARD_NAMES = {
  DEBIT: "Point · Débito",
  CREDIT: "Point · Crédito",
} as const satisfies Record<PointCardType, string>;

function smallRow(left: string, right: string): string[] {
  return row(left, right, "", SMALL_COLUMNS);
}

function logoImage(out: EscPosWriter, image: RasterImage): void {
  out.rasterImage(image, { bottomMarginDots: LOGO_BOTTOM_MARGIN_DOTS });
}

function logo(out: EscPosWriter): void {
  const { widthDots, heightDots, rows } = RECEIPT_LOGO;
  logoImage(out, {
    widthDots,
    heightDots,
    rows: concatenated(rows.map((encoded) => Uint8Array.from(Buffer.from(encoded, "base64")))),
  });
}

function branch(
  out: EscPosWriter,
  { address, whatsappNumber, instagramHandle }: ReceiptContent["header"],
): void {
  out.small([
    ...centered(address, SMALL_COLUMNS),
    ...centered(`WhatsApp ${whatsappNumber}  ·  ${instagramHandle}`, SMALL_COLUMNS),
  ]);
}

function notAnInvoice(out: EscPosWriter, block: DeferredSaleDocumentBlock): void {
  out.bold([...centered(block.invoiceClass), ...centered("DOCUMENTO NO VALIDO COMO FACTURA")]);
  out.lines([RULE]);
}

function voucherType(out: EscPosWriter, block: InvoiceBlock, title: string): void {
  const code = String(block.voucherTypeCode).padStart(VOUCHER_CODE_DIGITS, "0");
  const buyer = block.buyerTaxStatusDescription.toLocaleLowerCase("es-AR");
  out.lines([RULE]);
  out.bold(centered(`${title} ${block.invoiceClass}`));
  out.small(centered(`Cód. ${code}  ·  A ${buyer}`, SMALL_COLUMNS));
}

interface CorrectedInvoice {
  issuedOn: string;
  corrects: CreditNoteCFiscalBlock["corrects"];
}

function operation(
  out: EscPosWriter,
  { occurredAt, servedByFirstName, operationNumber }: ReceiptContent["operation"],
  block: InvoiceBlock | null,
  rules: ZoneRules,
  creditNote?: CorrectedInvoice,
): void {
  const wallClock = localClock(occurredAt, rules);
  const date =
    creditNote === undefined
      ? formatDate(wallClock, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone: "UTC",
        })
      : calendarDay(creditNote.issuedOn);
  const time = formatDate(wallClock, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
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
    ...(creditNote === undefined
      ? []
      : row(
          "Asociada a Factura C",
          `${formatPointOfSaleNumber(creditNote.corrects.pointOfSale)}-${formatInvoiceNumber(creditNote.corrects.number)}`,
        )),
    RULE,
  ]);
}

function issuer(out: EscPosWriter, { issuer }: InvoiceBlock): void {
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
  return promotion.name;
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

function saleLines(
  out: EscPosWriter,
  { lines, totals }: Pick<ReceiptContent, "lines"> & { totals: SaleTotals },
): void {
  out.bold(row("PRODUCTO", "IMPORTE"));
  out.lines([
    ...lines.flatMap(saleLine),
    RULE,
    ...row("Subtotal", formatCents(totals.subtotal)),
    ...(totals.saleDiscount === null
      ? []
      : row(saleDiscountText(totals.saleDiscount), `-${formatCents(totals.saleDiscount.amount)}`)),
    ...(totals.cashRounding === 0 ? [] : row("Redondeo", `-${formatCents(totals.cashRounding)}`)),
    RULE,
  ]);
  out.bold(row("TOTAL", formatCents(totals.total)));
}

function salePayments(out: EscPosWriter, { totals }: Pick<ReceiptContent, "totals">): void {
  out.lines([
    RULE,
    ...totals.payments.flatMap(({ method, amount, cardType }) =>
      row(
        cardType === null ? PAYMENT_NAMES[method] : POINT_CARD_NAMES[cardType],
        formatCents(amount),
      ),
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

function isOffline(block: InvoiceBlock): block is OfflineInvoiceBlock {
  return "fortnight" in block;
}

function authorizationLine(block: InvoiceBlock): string {
  if (isOffline(block)) {
    const firstDay = formatDate(new Date(`${block.fortnight.start}T00:00:00Z`), {
      day: "numeric",
      timeZone: "UTC",
    });
    return `CAEA ${block.authorizationCode}  ·  Quincena ${firstDay} al ${calendarDay(block.fortnight.end)}`;
  }
  return `CAE ${block.authorizationCode}  ·  Vto. ${calendarDay(block.authorizationCodeDueOn)}`;
}

function authorization(out: EscPosWriter, block: InvoiceBlock): void {
  out.feed(QR_TOP_MARGIN_DOTS);
  out.qr(block.qrText, { correction: "L", sideDots: QR_SIDE_DOTS });
  out.blankImage(QR_BOTTOM_MARGIN_DOTS);
  out.small([
    ...centered("Comprobante autorizado", SMALL_COLUMNS),
    ...centered(authorizationLine(block), SMALL_COLUMNS),
  ]);
}

function deferredSaleReference(out: EscPosWriter, block: DeferredSaleDocumentBlock): void {
  out.lines([RULE]);
  out.bold(row("Código de consulta", formatShortCode(block.shortCode)));
  out.feed(QR_TOP_MARGIN_DOTS);
  out.qr(block.qrText, { correction: "L", sideDots: QR_SIDE_DOTS });
  out.blankImage(QR_BOTTOM_MARGIN_DOTS);
  out.small(centered("Volvé con este ticket a retirar tu factura.", SMALL_COLUMNS));
}

function closing(out: EscPosWriter): void {
  out.lines([RULE]);
  out.bold(centered("Gracias por tu compra"));
  out.small(centered("Cambios y devoluciones solo con este ticket.", SMALL_COLUMNS));
  out.cut();
}

function refunds(out: EscPosWriter, content: CreditNoteReceiptContent["refunds"]): void {
  out.lines([
    RULE,
    ...content.flatMap(({ method, amount }) => row(REFUND_NAMES[method], formatCents(amount))),
  ]);
}

function renderCreditNote(content: CreditNoteReceiptContent, rules: ZoneRules): StoredReceipt {
  const head = new EscPosWriter();
  head.initialize();
  logo(head);
  branch(head, content.header);
  voucherType(head, content.fiscal, "NOTA DE CRÉDITO");
  const body = new EscPosWriter();
  operation(body, content.operation, content.fiscal, rules, {
    issuedOn: content.issuedOn,
    corrects: content.fiscal.corrects,
  });
  issuer(body, content.fiscal);
  saleLines(body, content);
  refunds(body, content.refunds);
  authorization(body, content.fiscal);
  closing(body);
  return { templateVersion: TEMPLATE_VERSION, head: head.bytes(), body: body.bytes() };
}

function duplicateLegend(orderNumber: number): Uint8Array {
  const out = new EscPosWriter();
  out.bold(centered(`COPIA DUPLICADA Nº ${orderNumber}`));
  return out.bytes();
}

function asBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function startsAt(bytes: Uint8Array, position: number, prefix: Uint8Array): boolean {
  return asBuffer(bytes)
    .subarray(position, position + prefix.length)
    .equals(prefix);
}

function headWithCurrentLogo(head: Uint8Array, storedLogoStart: Uint8Array): Uint8Array {
  const start = asBuffer(head).indexOf(storedLogoStart);
  if (start === -1) {
    throw new Error("stored receipt head holds no logo");
  }
  const strips: Uint8Array[] = [];
  let widthBytes = 0;
  let heightDots = 0;
  let position = start + storedLogoStart.length - RASTER_IMAGE.length;
  while (startsAt(head, position, RASTER_IMAGE)) {
    const size = new DataView(head.buffer, head.byteOffset + position + RASTER_IMAGE.length);
    widthBytes = size.getUint16(0, true);
    const stripRows = size.getUint16(2, true);
    const rowsStart = position + RASTER_IMAGE_HEADER_BYTES;
    position = rowsStart + widthBytes * stripRows;
    strips.push(head.subarray(rowsStart, position));
    heightDots += stripRows;
  }
  const out = new EscPosWriter();
  logoImage(out, { widthDots: widthBytes * 8, heightDots, rows: concatenated(strips) });
  return concatenated([
    head.subarray(0, start),
    out.bytes(),
    head.subarray(position + FEED_COMMAND_BYTES),
  ]);
}

function bodyWithCurrentQrMargins(body: Uint8Array): Uint8Array {
  const margin = new EscPosWriter();
  margin.blankImage(QR_BOTTOM_MARGIN_DOTS);
  const chunks: Uint8Array[] = [];
  let from = 0;
  for (
    let at = asBuffer(body).indexOf(QR_PRINT_THEN_LEFT_ALIGNMENT);
    at !== -1;
    at = asBuffer(body).indexOf(QR_PRINT_THEN_LEFT_ALIGNMENT, from)
  ) {
    const marginStart = at + QR_PRINT_THEN_LEFT_ALIGNMENT.length;
    if (!startsAt(body, marginStart, FEED_COMMAND)) {
      throw new Error("stored receipt body holds a QR with no feed below it");
    }
    chunks.push(body.subarray(from, marginStart), margin.bytes());
    from = marginStart + FEED_COMMAND_BYTES;
  }
  chunks.push(body.subarray(from));
  return concatenated(chunks);
}

interface StoredLayout {
  head: (stored: Uint8Array) => Uint8Array;
  body: (stored: Uint8Array) => Uint8Array;
}

const CURRENT_LAYOUTS: Record<string, StoredLayout> = {
  "1": {
    head: (head) => headWithCurrentLogo(head, FIRST_VERSION_LOGO_START),
    body: bodyWithCurrentQrMargins,
  },
  "2": { head: (head) => headWithCurrentLogo(head, RASTER_IMAGE), body: bodyWithCurrentQrMargins },
  [TEMPLATE_VERSION]: { head: (head) => head, body: (body) => body },
};

function render(content: ReceiptContent, rules: ZoneRules): StoredReceipt {
  const invoice = content.fiscal?.invoiceClass === "C" ? content.fiscal : null;
  const deferred = content.fiscal?.invoiceClass === "X" ? content.fiscal : null;
  const head = new EscPosWriter();
  head.initialize();
  if (deferred !== null) {
    notAnInvoice(head, deferred);
  }
  logo(head);
  branch(head, content.header);
  if (invoice !== null) {
    voucherType(head, invoice, "FACTURA");
  }
  const body = new EscPosWriter();
  operation(body, content.operation, invoice, rules);
  if (invoice !== null) {
    issuer(body, invoice);
  }
  saleLines(body, content);
  salePayments(body, content);
  if (invoice !== null) {
    authorization(body, invoice);
  }
  if (deferred !== null) {
    deferredSaleReference(body, deferred);
  }
  closing(body);
  return { templateVersion: TEMPLATE_VERSION, head: head.bytes(), body: body.bytes() };
}

function printable(stored: StoredReceipt, copy: ReceiptCopy): Uint8Array {
  const layout = CURRENT_LAYOUTS[stored.templateVersion];
  if (layout === undefined) {
    throw new Error(`unknown receipt template version ${stored.templateVersion}`);
  }
  const head = layout.head(stored.head);
  const body = layout.body(stored.body);
  if (copy.kind === "original") {
    return concatenated([head, body]);
  }
  return concatenated([head, duplicateLegend(copy.orderNumber), body]);
}

export function escPosReceiptTemplate(zoneRules: ZoneRulesSource): ReceiptTemplate {
  return {
    render: (content) => render(content, zoneRules.zoneRules()),
    renderCreditNote: (content) => renderCreditNote(content, zoneRules.zoneRules()),
    printable,
  };
}
