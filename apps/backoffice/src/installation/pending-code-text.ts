import { plural } from "@purosur/ui";

function minutes(count: number): string {
  return plural(count, { one: "1 minuto", other: `${count} minutos` });
}

export function pendingCodeIssuedText(secondsSinceIssued: number): string {
  const elapsedMinutes = Math.floor(secondsSinceIssued / 60);
  return elapsedMinutes < 1
    ? "Código emitido recién"
    : `Código emitido hace ${minutes(elapsedMinutes)}`;
}

export function pendingCodeExpiryText(secondsUntilExpiry: number): string {
  return `Vence en ${minutes(Math.ceil(secondsUntilExpiry / 60))}`;
}

export function pendingCodeAfter(
  pendingCode: { secondsSinceIssued: number; secondsUntilExpiry: number },
  secondsPassed: number,
): { secondsSinceIssued: number; secondsUntilExpiry: number } | null {
  const secondsUntilExpiry = pendingCode.secondsUntilExpiry - secondsPassed;
  return secondsUntilExpiry > 0
    ? { secondsSinceIssued: pendingCode.secondsSinceIssued + secondsPassed, secondsUntilExpiry }
    : null;
}
