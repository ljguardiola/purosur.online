import { userPinCodeSchema } from "@purosur/contracts";
import { formatNumber, plural } from "@purosur/ui";
import { schemaLimit } from "../platform/schema-limit";

const PIN_CODE_VALIDITY_MS = schemaLimit(userPinCodeSchema.shape.expires_at.meta()?.["validityMs"]);

export function pinCodeValidity(): string {
  const minutes = PIN_CODE_VALIDITY_MS / 60_000;
  return `${formatNumber(minutes)} ${plural(minutes, { one: "minuto", other: "minutos" })}`;
}
