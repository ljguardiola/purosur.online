import type { RegisterStatus } from "@purosur/contracts";

type Contingency = NonNullable<RegisterStatus["contingency"]>;

export function fiscalModeText(kind: Contingency["kind"]): string {
  return kind === "offline_code" ? "Contingencia CAEA" : "Venta diferida";
}
