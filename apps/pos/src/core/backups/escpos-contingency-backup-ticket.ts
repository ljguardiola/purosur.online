import type { CashMovementKind, ZoneRules } from "@purosur/domain";
import {
  formatDate,
  formatInvoiceNumber,
  formatOperationNumber,
  formatPointOfSaleNumber,
} from "@purosur/ui/formatters";
import { argentinaWallClock } from "../platform/argentina-time";
import { encodePc850 } from "../sales/receipt-printer/pc850";

export type BackedDocument =
  | { kind: "invoice"; pointOfSale: number; number: number }
  | { kind: "credit_note"; pointOfSale: number; number: number }
  | { kind: "deferred_sale_document"; shortCode: string };

export type PrintedOperation =
  | { kind: "numbered"; operationNumber: number }
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

const COLUMNS = 48;
const RULE = "─".repeat(COLUMNS);
const ESC = 0x1b;
const GS = 0x1d;
const LINE_FEED = 0x0a;
const PC850_TABLE = 2;
const FEED_LINES = 5;
const BETWEEN_QR_CODES_DOTS = 16;
const QR_MODULE_DOTS = 4;
const QR_CORRECTION_LEVEL_M = 0x31;
const QR_STORE_OVERHEAD = 3;
const CENTER_ALIGNMENT = 1;
const LEFT_ALIGNMENT = 0;
const SHORT_CODE_GROUP_LENGTH = 4;

const OPERATION_NAMES = {
  cash_session_opening: "Apertura de caja",
  cash_session_closing: "Cierre de caja",
  initial_count: "Inventario inicial",
  clock_correction: "Corrección del reloj",
} as const;

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

function centered(text: string): string {
  return " ".repeat(Math.floor((COLUMNS - text.length) / 2)) + text;
}

function row(label: string, value: string): string[] {
  if (label.length + 1 + value.length <= COLUMNS) {
    return [label + " ".repeat(COLUMNS - label.length - value.length) + value];
  }
  return [label, ...wrapped(value, COLUMNS).map((line) => line.padStart(COLUMNS))];
}

function operationName(operation: PrintedOperation): string {
  switch (operation.kind) {
    case "numbered":
      return formatOperationNumber(operation.operationNumber);
    case "cash_movement":
      if (operation.movement === null) return "Movimiento de efectivo";
      return operation.movement === "CASH_IN" ? "Ingreso de efectivo" : "Retiro de efectivo";
    default:
      return OPERATION_NAMES[operation.kind];
  }
}

function backedDocumentName(document: BackedDocument): string {
  switch (document.kind) {
    case "invoice":
      return `Factura C ${formatPointOfSaleNumber(document.pointOfSale)}-${formatInvoiceNumber(document.number)}`;
    case "credit_note":
      return `Nota de crédito C ${formatPointOfSaleNumber(document.pointOfSale)}-${formatInvoiceNumber(document.number)}`;
    case "deferred_sale_document":
      return `Documento X ${document.shortCode.slice(0, SHORT_CODE_GROUP_LENGTH)}-${document.shortCode.slice(SHORT_CODE_GROUP_LENGTH)}`;
  }
}

class Output {
  private readonly chunks: Uint8Array[] = [];

  command(...bytes: number[]): void {
    this.chunks.push(Uint8Array.from(bytes));
  }

  lines(lines: readonly string[]): void {
    for (const line of lines) {
      this.chunks.push(encodePc850(line), Uint8Array.of(LINE_FEED));
    }
  }

  bold(line: string): void {
    this.command(ESC, 0x45, 1);
    this.chunks.push(encodePc850(line));
    this.command(ESC, 0x45, 0);
    this.chunks.push(Uint8Array.of(LINE_FEED));
  }

  qr(text: string): void {
    const data = encodePc850(text);
    const stored = data.length + QR_STORE_OVERHEAD;
    this.command(ESC, 0x61, CENTER_ALIGNMENT);
    this.command(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0);
    this.command(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, QR_MODULE_DOTS);
    this.command(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, QR_CORRECTION_LEVEL_M);
    this.command(GS, 0x28, 0x6b, stored & 0xff, stored >> 8, 0x31, 0x50, 0x30);
    this.chunks.push(data);
    this.command(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30);
    this.command(ESC, 0x61, LEFT_ALIGNMENT);
  }

  bytes(): Uint8Array {
    const joined = new Uint8Array(this.chunks.reduce((length, chunk) => length + chunk.length, 0));
    let offset = 0;
    for (const chunk of this.chunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    return joined;
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
  const wallClock = argentinaWallClock(createdAt, rules);
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
  const out = new Output();
  out.command(ESC, 0x40);
  out.command(ESC, 0x74, PC850_TABLE);
  out.bold(centered("RESPALDO DE CONTINGENCIA"));
  out.lines([
    RULE,
    "Guardar en la caja de respaldos del local.",
    RULE,
    ...row("Sucursal", branchAddress),
    ...row("Caja", registerName),
    ...row(`Fecha ${date}`, `Hora ${time}`),
    ...row("Operación", operationName(operation)),
    ...(backs === null ? [] : row("Respalda", backedDocumentName(backs))),
    RULE,
  ]);
  qrCodes.forEach((text, index) => {
    if (index > 0) out.command(ESC, 0x4a, BETWEEN_QR_CODES_DOTS);
    out.qr(text);
    out.lines([centered(`${index + 1} de ${qrCodes.length}`)]);
  });
  out.command(ESC, 0x64, FEED_LINES);
  out.command(GS, 0x56, 1);
  return out.bytes();
}
