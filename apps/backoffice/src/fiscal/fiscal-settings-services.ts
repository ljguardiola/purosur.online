import { startAuthentication } from "@simplewebauthn/browser";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import { fetchCurrentZoneRules } from "../platform/zone-rules-api";
import {
  fetchBuyerIdentificationThresholds,
  recordBuyerIdentificationThreshold,
} from "./buyer-identification-threshold-api";
import { fetchClockCorrections } from "./clock-corrections-api";
import type { EditFiscalAddressModalServices } from "./edit-fiscal-address-modal";
import type { EditIssuerIdentificationModalServices } from "./edit-issuer-identification-modal";
import {
  createFiscalAddress,
  editFiscalAddress,
  fetchFiscalAddresses,
} from "./fiscal-addresses-api";
import { fetchIssuerIdentification, saveIssuerIdentification } from "./issuer-identification-api";
import type { NewFiscalAddressModalServices } from "./new-fiscal-address-modal";
import type { RecordBuyerIdentificationThresholdModalServices } from "./record-buyer-identification-threshold-modal";

export type FiscalSettingsScreenServices = EditIssuerIdentificationModalServices &
  RecordBuyerIdentificationThresholdModalServices &
  NewFiscalAddressModalServices &
  EditFiscalAddressModalServices & {
    fetchIssuerIdentification: typeof fetchIssuerIdentification;
    fetchBuyerIdentificationThresholds: typeof fetchBuyerIdentificationThresholds;
    fetchClockCorrections: typeof fetchClockCorrections;
    fetchFiscalAddresses: typeof fetchFiscalAddresses;
  };

export const defaultFiscalSettingsScreenServices: FiscalSettingsScreenServices = {
  fetchIssuerIdentification,
  saveIssuerIdentification,
  fetchBuyerIdentificationThresholds,
  recordBuyerIdentificationThreshold,
  fetchClockCorrections,
  fetchFiscalAddresses,
  createFiscalAddress,
  editFiscalAddress,
  fetchCurrentZoneRules,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
