import type { OfflinePointOfSaleConfigurationBody } from "@purosur/contracts";
import { parsePointOfSaleNumber } from "@purosur/ui";
import { typedPointOfSaleNumber } from "./register-point-of-sale-form";
import type { RegisterPointOfSale } from "./register-points-of-sale-api";

export type OfflinePointOfSaleFormValues = {
  pointOfSaleNumber: string;
  version: number;
};

export const EMPTY_OFFLINE_POINT_OF_SALE_FORM: OfflinePointOfSaleFormValues = {
  pointOfSaleNumber: "",
  version: 0,
};

export function offlinePointOfSaleFormValuesFrom(
  register: RegisterPointOfSale,
): OfflinePointOfSaleFormValues {
  return {
    pointOfSaleNumber: typedPointOfSaleNumber(register.offlinePointOfSaleNumber),
    version: register.offlineVersion,
  };
}

export function offlinePointOfSaleRequestFrom({
  pointOfSaleNumber,
  version,
}: OfflinePointOfSaleFormValues): OfflinePointOfSaleConfigurationBody {
  return { point_of_sale_number: parsePointOfSaleNumber(pointOfSaleNumber), version };
}
