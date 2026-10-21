import { startAuthentication } from "@simplewebauthn/browser";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { EditFiscalAddressModalServices } from "./edit-fiscal-address-modal";
import type { EditRegisterOfflinePointOfSaleModalServices } from "./edit-register-offline-point-of-sale-modal";
import type { EditRegisterPointOfSaleModalServices } from "./edit-register-point-of-sale-modal";
import {
  createFiscalAddress,
  editFiscalAddress,
  fetchFiscalAddresses,
} from "./fiscal-addresses-api";
import { fetchFortnightPresentations } from "./fortnight-presentations-api";
import type { NewFiscalAddressModalServices } from "./new-fiscal-address-modal";
import { fetchOfflinePointsOfSale, retireOfflinePointOfSale } from "./offline-points-of-sale-api";
import {
  configureRegisterOfflinePointOfSale,
  configureRegisterPointOfSale,
  fetchRegisterPointsOfSale,
} from "./register-points-of-sale-api";
import type { RetireOfflinePointOfSaleModalServices } from "./retire-offline-point-of-sale-modal";

export type PointsOfSaleScreenServices = EditRegisterPointOfSaleModalServices &
  EditRegisterOfflinePointOfSaleModalServices &
  NewFiscalAddressModalServices &
  EditFiscalAddressModalServices &
  RetireOfflinePointOfSaleModalServices & {
    fetchRegisterPointsOfSale: typeof fetchRegisterPointsOfSale;
    fetchFiscalAddresses: typeof fetchFiscalAddresses;
    fetchFortnightPresentations: typeof fetchFortnightPresentations;
    fetchOfflinePointsOfSale: typeof fetchOfflinePointsOfSale;
  };

export const defaultPointsOfSaleScreenServices: PointsOfSaleScreenServices = {
  fetchRegisterPointsOfSale,
  fetchFiscalAddresses,
  fetchFortnightPresentations,
  fetchOfflinePointsOfSale,
  retireOfflinePointOfSale,
  configureRegisterPointOfSale,
  configureRegisterOfflinePointOfSale,
  createFiscalAddress,
  editFiscalAddress,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
