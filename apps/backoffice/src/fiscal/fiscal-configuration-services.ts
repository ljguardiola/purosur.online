import { startAuthentication } from "@simplewebauthn/browser";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import {
  fetchBuyerIdentificationThresholds,
  recordBuyerIdentificationThreshold,
} from "./buyer-identification-threshold-api";
import { fetchClockCorrections } from "./clock-corrections-api";
import type { EditIssuerIdentificationModalServices } from "./edit-issuer-identification-modal";
import { fetchIssuerIdentification, saveIssuerIdentification } from "./issuer-identification-api";
import type { RecordBuyerIdentificationThresholdModalServices } from "./record-buyer-identification-threshold-modal";

export type FiscalConfigurationScreenServices = EditIssuerIdentificationModalServices &
  RecordBuyerIdentificationThresholdModalServices & {
    fetchIssuerIdentification: typeof fetchIssuerIdentification;
    fetchBuyerIdentificationThresholds: typeof fetchBuyerIdentificationThresholds;
    fetchClockCorrections: typeof fetchClockCorrections;
  };

export const defaultFiscalConfigurationScreenServices: FiscalConfigurationScreenServices = {
  fetchIssuerIdentification,
  saveIssuerIdentification,
  fetchBuyerIdentificationThresholds,
  recordBuyerIdentificationThreshold,
  fetchClockCorrections,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
