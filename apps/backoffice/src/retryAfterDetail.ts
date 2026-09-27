import { plural } from "@purosur/ui";

export function retryAfterDetail(retryAfterSeconds: number): string {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Se puede volver a intentar en ${plural(minutes, { one: "1 minuto", other: `${minutes} minutos` })}.`;
}
