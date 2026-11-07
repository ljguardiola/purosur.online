import { startAuthentication } from "@simplewebauthn/browser";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import { fetchBuyerTaxStatuses } from "./buyer-tax-statuses-api";
import type { ConfirmRevokedInstallationModalServices } from "./confirm-revoked-installation-modal";
import { fetchExceptionShareYear } from "./exception-share-api";
import type { ExceptionalitySectionServices } from "./exceptionality-section";
import { fetchFiscalAddresses } from "./fiscal-addresses-api";
import {
  confirmRevokedInstallation,
  fetchFortnightPresentations,
  remedyRejectedDocument,
} from "./fortnight-presentations-api";
import { fetchOfflinePointsOfSale, retireOfflinePointOfSale } from "./offline-points-of-sale-api";
import { fetchRegisterPointsOfSale } from "./register-points-of-sale-api";
import type { RetireOfflinePointOfSaleModalServices } from "./retire-offline-point-of-sale-modal";
import type { ReviewRejectedDocumentModalServices } from "./review-rejected-document-modal";

export type CaeaFortnightReportsServices = ReviewRejectedDocumentModalServices &
  ConfirmRevokedInstallationModalServices & {
    fetchRegisterPointsOfSale: typeof fetchRegisterPointsOfSale;
    fetchFortnightPresentations: typeof fetchFortnightPresentations;
  };

export type CaeaPointsOfSaleServices = RetireOfflinePointOfSaleModalServices & {
  fetchRegisterPointsOfSale: typeof fetchRegisterPointsOfSale;
  fetchFiscalAddresses: typeof fetchFiscalAddresses;
  fetchOfflinePointsOfSale: typeof fetchOfflinePointsOfSale;
};

export type CaeaScreenServices = ExceptionalitySectionServices &
  CaeaFortnightReportsServices &
  CaeaPointsOfSaleServices;

export const defaultCaeaScreenServices: CaeaScreenServices = {
  fetchFiscalAddresses,
  fetchExceptionShareYear,
  fetchRegisterPointsOfSale,
  fetchFortnightPresentations,
  fetchOfflinePointsOfSale,
  retireOfflinePointOfSale,
  remedyRejectedDocument,
  confirmRevokedInstallation,
  fetchBuyerTaxStatuses,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
