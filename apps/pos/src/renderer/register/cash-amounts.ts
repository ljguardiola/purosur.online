import { formatCents } from "@purosur/ui";

export function signedAmount(sign: "+" | "−", cents: number): string {
  return `${sign} ${formatCents(cents)}`;
}

export function directedAmount({
  amount,
  direction,
}: {
  amount: number;
  direction: "in" | "out" | "none";
}): string {
  switch (direction) {
    case "in":
      return signedAmount("+", amount);
    case "out":
      return signedAmount("−", amount);
    case "none":
      return formatCents(amount);
  }
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
