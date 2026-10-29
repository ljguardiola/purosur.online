import { type CashMovementKind, localClock, type ZoneRules } from "@purosur/domain";
import {
  formatCents,
  formatDate,
  formatInvoiceNumber,
  formatOperationNumber,
  formatPointOfSaleNumber,
  formatShortCode,
} from "@purosur/ui/formatters";
import { centered, EscPosWriter, labeledValue, RULE } from "../platform/escpos/escpos-writer";

export type BackedDocument =
  | { kind: "invoice"; pointOfSale: number; number: number }
  | { kind: "credit_note"; pointOfSale: number; number: number }
  | { kind: "deferred_sale_document"; shortCode: string };

export type OriginalTicket =
  | { kind: "operation_number"; operationNumber: number }
  | Extract<BackedDocument, { kind: "invoice" | "deferred_sale_document" }>;

export type PrintedOperation =
  | { kind: "numbered"; operationNumber: number }
  | { kind: "return"; original: OriginalTicket | null; cashRefunded: number }
  | { kind: "cash_movement"; movement: CashMovementKind | null }
  | { kind: "cash_session_opening" }
  | { kind: "cash_session_closing" }
  | { kind: "initial_count" }
  | { kind: "clock_correction" };

export interface ContingencyBackupTicketPrintout {
  createdAt: Date;
  branchAddress: string;
  registerName: string;
  operation: PrintedOperation;
  backs: BackedDocument | null;
  qrCodes: readonly string[];
}

const BETWEEN_QR_CODES_DOTS = 16;
const QR_MODULE_DOTS = 4;

const OPERATION_NAMES = {
  cash_session_opening: "Apertura de caja",
  cash_session_closing: "Cierre de caja",
  initial_count: "Inventario inicial",
  clock_correction: "Corrección del reloj",
} as const;

function operationName(operation: PrintedOperation): string {
  switch (operation.kind) {
    case "numbered":
      return formatOperationNumber(operation.operationNumber);
    case "return":
      return "Devolución";
    case "cash_movement":
      if (operation.movement === null) return "Movimiento de efectivo";
      return operation.movement === "CASH_IN" ? "Ingreso de efectivo" : "Retiro de efectivo";
    default:
      return OPERATION_NAMES[operation.kind];
  }
}

function originalTicketName(original: OriginalTicket): string {
  return original.kind === "operation_number"
    ? formatOperationNumber(original.operationNumber)
    : backedDocumentName(original);
}

function returnRows(operation: PrintedOperation): string[] {
  if (operation.kind !== "return") return [];
  return [
    ...(operation.original === null
      ? []
      : labeledValue("Ticket original", originalTicketName(operation.original))),
    ...(operation.cashRefunded === 0
      ? []
      : labeledValue("Efectivo devuelto", formatCents(operation.cashRefunded))),
  ];
}

function backedDocumentName(document: BackedDocument): string {
  switch (document.kind) {
    case "invoice":
      return `Factura C ${formatPointOfSaleNumber(document.pointOfSale)}-${formatInvoiceNumber(document.number)}`;
    case "credit_note":
      return `Nota de crédito C ${formatPointOfSaleNumber(document.pointOfSale)}-${formatInvoiceNumber(document.number)}`;
    case "deferred_sale_document":
      return `Documento X ${formatShortCode(document.shortCode)}`;
  }
}

export function renderContingencyBackupTicket(
  {
    createdAt,
    branchAddress,
    registerName,
    operation,
    backs,
    qrCodes,
  }: ContingencyBackupTicketPrintout,
  rules: ZoneRules,
): Uint8Array {
  const wallClock = localClock(createdAt, rules);
  const date = formatDate(wallClock, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
  const time = formatDate(wallClock, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  });
  const out = new EscPosWriter();
  out.initialize();
  out.bold(centered("RESPALDO DE CONTINGENCIA"));
  out.lines([
    RULE,
    "Guardar en la caja de respaldos del local.",
    RULE,
    ...labeledValue("Sucursal", branchAddress),
    ...labeledValue("Caja", registerName),
    ...labeledValue(`Fecha ${date}`, `Hora ${time}`),
    ...labeledValue("Operación", operationName(operation)),
    ...returnRows(operation),
    ...(backs === null ? [] : labeledValue("Respalda", backedDocumentName(backs))),
    RULE,
  ]);
  qrCodes.forEach((text, index) => {
    if (index > 0) out.feed(BETWEEN_QR_CODES_DOTS);
    out.qr(text, { correction: "M", moduleDots: QR_MODULE_DOTS });
    out.lines(centered(`${index + 1} de ${qrCodes.length}`));
  });
  out.cut();
  return out.bytes();
}
