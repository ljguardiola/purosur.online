import { startAuthentication } from "@simplewebauthn/browser";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { EditFiscalAddressModalServices } from "./edit-fiscal-address-modal";
import type { EditRegisterPointOfSaleModalServices } from "./edit-register-point-of-sale-modal";
import {
  createFiscalAddress,
  editFiscalAddress,
  fetchFiscalAddresses,
} from "./fiscal-addresses-api";
import type { NewFiscalAddressModalServices } from "./new-fiscal-address-modal";
import {
  configureRegisterPointOfSale,
  fetchRegisterPointsOfSale,
} from "./register-points-of-sale-api";

export type PointsOfSaleScreenServices = EditRegisterPointOfSaleModalServices &
  NewFiscalAddressModalServices &
  EditFiscalAddressModalServices & {
    fetchRegisterPointsOfSale: typeof fetchRegisterPointsOfSale;
    fetchFiscalAddresses: typeof fetchFiscalAddresses;
  };

export const defaultPointsOfSaleScreenServices: PointsOfSaleScreenServices = {
  fetchRegisterPointsOfSale,
  fetchFiscalAddresses,
  configureRegisterPointOfSale,
  createFiscalAddress,
  editFiscalAddress,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
