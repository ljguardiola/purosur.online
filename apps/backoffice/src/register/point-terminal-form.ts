import type { PointTerminalAssignmentBody } from "@purosur/contracts";
import type { RegisterSummary } from "./registers-api";

export type PointTerminalFormValues = {
  terminalId: string;
  version: number;
};

export const EMPTY_POINT_TERMINAL_FORM: PointTerminalFormValues = { terminalId: "", version: 0 };

export function pointTerminalFormValuesFrom(
  register: Pick<RegisterSummary, "pointTerminalId" | "pointTerminalVersion">,
): PointTerminalFormValues {
  return { terminalId: register.pointTerminalId ?? "", version: register.pointTerminalVersion };
}

export function pointTerminalRequestFrom({
  terminalId,
  version,
}: PointTerminalFormValues): PointTerminalAssignmentBody {
  return { terminal_id: terminalId.trim(), version };
}

export function pointTerminalMessage({
  terminalId,
}: Pick<PointTerminalFormValues, "terminalId">): string {
  return terminalId.trim() === ""
    ? "Ingresá el identificador de la terminal."
    : "El identificador de la terminal no puede tener espacios.";
}
