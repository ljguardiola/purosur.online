import type {
  OfflinePointOfSaleConfigurationBody,
  PointOfSaleConfigurationBody,
} from "@purosur/contracts";
import { parsePointOfSaleNumber } from "@purosur/ui";
import type { RegisterPointOfSale } from "./register-points-of-sale-api";

export type RegisterPointOfSaleFormValues = {
  pointOfSaleNumber: string;
  fiscalAddressId: string | null;
  version: number;
};

export const EMPTY_REGISTER_POINT_OF_SALE_FORM: RegisterPointOfSaleFormValues = {
  pointOfSaleNumber: "",
  fiscalAddressId: null,
  version: 0,
};

export function registerPointOfSaleFormValuesFrom(
  register: RegisterPointOfSale,
  mechanism: "real_time" | "offline" = "real_time",
): RegisterPointOfSaleFormValues {
  const offline = mechanism === "offline";
  const number = offline ? register.offlinePointOfSaleNumber : register.pointOfSaleNumber;
  return {
    pointOfSaleNumber: number === null ? "" : String(number),
    fiscalAddressId: register.fiscalAddressId,
    version: offline ? register.offlineVersion : register.version,
  };
}

export function registerPointOfSaleRequestFrom({
  pointOfSaleNumber,
  fiscalAddressId,
  version,
}: RegisterPointOfSaleFormValues): PointOfSaleConfigurationBody {
  return {
    point_of_sale_number: parsePointOfSaleNumber(pointOfSaleNumber),
    fiscal_address_id: fiscalAddressId ?? "",
    version,
  };
}

export function offlinePointOfSaleRequestFrom({
  pointOfSaleNumber,
  version,
}: RegisterPointOfSaleFormValues): OfflinePointOfSaleConfigurationBody {
  return { point_of_sale_number: parsePointOfSaleNumber(pointOfSaleNumber), version };
}

export function pointOfSaleNumberMessage({
  pointOfSaleNumber,
}: RegisterPointOfSaleFormValues): string {
  return pointOfSaleNumber.trim() === ""
    ? "Ingresá el punto de venta."
    : "Revisá el punto de venta.";
}

export function fiscalAddressMessage(): string {
  return "Elegí el domicilio fiscal.";
}
