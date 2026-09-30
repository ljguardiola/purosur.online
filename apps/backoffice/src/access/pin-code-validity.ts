import { PIN_CODE_VALIDITY_MS } from "@purosur/domain";
import { formatNumber, plural } from "@purosur/ui";

export function pinCodeValidity(): string {
  const minutes = PIN_CODE_VALIDITY_MS / 60_000;
  return `${formatNumber(minutes)} ${plural(minutes, { one: "minuto", other: "minutos" })}`;
}
