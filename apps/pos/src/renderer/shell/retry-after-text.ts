import { plural } from "@purosur/ui";

export function retryAfterText(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Se puede volver a intentar en ${plural(minutes, { one: "1 minuto", other: `${minutes} minutos` })}.`;
}
