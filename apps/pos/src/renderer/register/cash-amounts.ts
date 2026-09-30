import { countedCashSchema, parseAmountCents } from "@purosur/contracts";
import { formatCents } from "@purosur/ui";

const REQUIRED_MESSAGE = "Ingresá el efectivo contado.";
export const INVALID_COUNTED_CASH_MESSAGE = "Ingresá un importe válido, por ejemplo 31.500,00.";

export function signedAmount(sign: "+" | "−", cents: number): string {
  return `${sign} ${formatCents(cents)}`;
}

export function countedCashFrom(typed: string): { cents: number } | { message: string } {
  if (typed.trim() === "") {
    return { message: REQUIRED_MESSAGE };
  }
  const counted = countedCashSchema.safeParse(parseAmountCents(typed));
  return counted.success ? { cents: counted.data } : { message: INVALID_COUNTED_CASH_MESSAGE };
}

export function differenceText(difference: number): string {
  if (difference === 0) {
    return formatCents(0);
  }
  return signedAmount(difference < 0 ? "−" : "+", Math.abs(difference));
}

export function differenceNotice(difference: number): string | undefined {
  if (difference === 0) {
    return undefined;
  }
  const verb = difference < 0 ? "Faltan" : "Sobran";
  return `${verb} ${formatCents(Math.abs(difference))}. La diferencia se registra con la sesión y no impide cerrarla.`;
}
