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
