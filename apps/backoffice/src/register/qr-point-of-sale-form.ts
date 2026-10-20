import type { QrPointOfSaleAssignmentBody } from "@purosur/contracts";
import type { RegisterSummary } from "./registers-api";

export type QrPointOfSaleFormValues = {
  externalPosId: string;
  version: number;
};

export const EMPTY_QR_POINT_OF_SALE_FORM: QrPointOfSaleFormValues = {
  externalPosId: "",
  version: 0,
};

export function qrPointOfSaleFormValuesFrom(
  register: Pick<RegisterSummary, "qrExternalPosId" | "qrPointOfSaleVersion">,
): QrPointOfSaleFormValues {
  return {
    externalPosId: register.qrExternalPosId ?? "",
    version: register.qrPointOfSaleVersion,
  };
}

export function qrPointOfSaleRequestFrom({
  externalPosId,
  version,
}: QrPointOfSaleFormValues): QrPointOfSaleAssignmentBody {
  return { external_pos_id: externalPosId.trim(), version };
}

export function qrPointOfSaleMessage({
  externalPosId,
}: Pick<QrPointOfSaleFormValues, "externalPosId">): string {
  return externalPosId.trim() === ""
    ? "Ingresá el código de la caja QR."
    : "El código de la caja QR no puede tener espacios.";
}
