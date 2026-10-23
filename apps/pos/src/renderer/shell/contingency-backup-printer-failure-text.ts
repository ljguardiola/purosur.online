import type { ContingencyBackupTicketsAnswer } from "@purosur/contracts";

export type BackupPrinterFailure = NonNullable<ContingencyBackupTicketsAnswer["printer"]>;

const PRINTER_STATE: Record<BackupPrinterFailure, string | undefined> = {
  paper_out: "Sin papel",
  cover_open: "Tapa abierta",
  not_responding: "No responde",
  printer_not_configured: "Sin configurar",
  failed: undefined,
};

const WHAT_TO_DO: Record<BackupPrinterFailure, string> = {
  paper_out: "Poné un rollo nuevo y cerrá la tapa. Salen solos cuando la impresora tenga papel.",
  cover_open: "Cerrá la tapa de la impresora. Salen solos cuando se cierre.",
  not_responding:
    "Revisá que esté encendida y con el cable conectado. Salen solos cuando vuelva a responder.",
  printer_not_configured: "Cargá la dirección de la impresora en Impresora. Salen solos después.",
  failed: "Salen solos en el próximo intento.",
};

export function backupPrinterState(failure: BackupPrinterFailure): string | undefined {
  return PRINTER_STATE[failure];
}

export function backupPrinterWhatToDo(failure: BackupPrinterFailure | null): string {
  return failure === null ? "Salen solos después del documento del cliente." : WHAT_TO_DO[failure];
}
