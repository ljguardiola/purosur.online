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

export type OfflinePointOfSaleFormValues = {
  pointOfSaleNumber: string;
  version: number;
};

export const EMPTY_OFFLINE_POINT_OF_SALE_FORM: OfflinePointOfSaleFormValues = {
  pointOfSaleNumber: "",
  version: 0,
};

function typedPointOfSaleNumber(number: number | null): string {
  return number === null ? "" : String(number);
}

export function registerPointOfSaleFormValuesFrom(
  register: RegisterPointOfSale,
): RegisterPointOfSaleFormValues {
  return {
    pointOfSaleNumber: typedPointOfSaleNumber(register.pointOfSaleNumber),
    fiscalAddressId: register.fiscalAddressId,
    version: register.version,
  };
}

export function offlinePointOfSaleFormValuesFrom(
  register: RegisterPointOfSale,
): OfflinePointOfSaleFormValues {
  return {
    pointOfSaleNumber: typedPointOfSaleNumber(register.offlinePointOfSaleNumber),
    version: register.offlineVersion,
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
}: OfflinePointOfSaleFormValues): OfflinePointOfSaleConfigurationBody {
  return { point_of_sale_number: parsePointOfSaleNumber(pointOfSaleNumber), version };
}

export function pointOfSaleNumberMessage({
  pointOfSaleNumber,
}: Pick<RegisterPointOfSaleFormValues, "pointOfSaleNumber">): string {
  return pointOfSaleNumber.trim() === ""
    ? "Ingresá el punto de venta."
    : "Revisá el punto de venta.";
}

export function fiscalAddressMessage(): string {
  return "Elegí el domicilio fiscal.";
}
