import type { FiscalAddressCreationBody, FiscalAddressEditBody } from "@purosur/contracts";
import type { FiscalAddress } from "./fiscal-addresses-api";

export type FiscalAddressFormValues = {
  name: string;
  streetAddress: string;
  version: number;
};

export const EMPTY_FISCAL_ADDRESS_FORM: FiscalAddressFormValues = {
  name: "",
  streetAddress: "",
  version: 0,
};

export function fiscalAddressFormValuesFrom(address: FiscalAddress): FiscalAddressFormValues {
  return { name: address.name, streetAddress: address.streetAddress, version: address.version };
}

export function fiscalAddressCreationRequestFrom({
  name,
  streetAddress,
}: FiscalAddressFormValues): FiscalAddressCreationBody {
  return { name: name.trim(), street_address: streetAddress.trim() };
}

export function fiscalAddressEditRequestFrom(
  values: FiscalAddressFormValues,
): FiscalAddressEditBody {
  return { ...fiscalAddressCreationRequestFrom(values), version: values.version };
}

export function fiscalAddressNameMessage({ name }: FiscalAddressFormValues): string {
  return name.trim() === ""
    ? "Ingresá el nombre del domicilio fiscal."
    : "Ese nombre es demasiado largo.";
}

export function fiscalAddressStreetAddressMessage({
  streetAddress,
}: FiscalAddressFormValues): string {
  return streetAddress.trim() === ""
    ? "Ingresá la dirección del domicilio fiscal."
    : "Esa dirección es demasiado larga.";
}
