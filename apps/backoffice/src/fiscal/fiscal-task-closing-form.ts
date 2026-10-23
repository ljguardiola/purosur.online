import type { FiscalTaskClosingBody } from "@purosur/contracts";

export type FiscalTaskClosingFormValues = {
  note: string;
};

export const EMPTY_FISCAL_TASK_CLOSING_FORM: FiscalTaskClosingFormValues = { note: "" };

export function fiscalTaskClosingRequestFrom({
  note,
}: FiscalTaskClosingFormValues): FiscalTaskClosingBody {
  return { note: note.trim() };
}

export function fiscalTaskClosingNoteMessage({ note }: FiscalTaskClosingFormValues): string {
  return note.trim() === ""
    ? "Contá cómo se regularizó la tarea."
    : "Ese texto es demasiado largo.";
}
