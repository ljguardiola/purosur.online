import { codePointLength } from "../../shared/index.js";

export const FISCAL_ADDRESS_NAME_MAX_LENGTH = 100;

export const FISCAL_ADDRESS_STREET_ADDRESS_MAX_LENGTH = 200;

export function isFiscalAddressNameTooLong(name: string): boolean {
  return codePointLength(name) > FISCAL_ADDRESS_NAME_MAX_LENGTH;
}

export function isFiscalAddressStreetAddressTooLong(streetAddress: string): boolean {
  return codePointLength(streetAddress) > FISCAL_ADDRESS_STREET_ADDRESS_MAX_LENGTH;
}

export function isSameFiscalAddressName(first: string, second: string): boolean {
  return first.toLowerCase() === second.toLowerCase();
}
