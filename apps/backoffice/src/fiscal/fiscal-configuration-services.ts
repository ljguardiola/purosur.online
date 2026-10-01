import { startAuthentication } from "@simplewebauthn/browser";
import { authorizeSession, fetchSessionAuthorizationOptions } from "../access/session-api";
import {
  fetchBuyerIdentificationThresholds,
  recordBuyerIdentificationThreshold,
} from "./buyer-identification-threshold-api";
import type { EditIssuerIdentificationModalServices } from "./edit-issuer-identification-modal";
import { fetchIssuerIdentification, saveIssuerIdentification } from "./issuer-identification-api";
import type { RecordBuyerIdentificationThresholdModalServices } from "./record-buyer-identification-threshold-modal";

export type FiscalConfigurationScreenServices = EditIssuerIdentificationModalServices &
  RecordBuyerIdentificationThresholdModalServices & {
    fetchIssuerIdentification: typeof fetchIssuerIdentification;
    fetchBuyerIdentificationThresholds: typeof fetchBuyerIdentificationThresholds;
  };

export const defaultFiscalConfigurationScreenServices: FiscalConfigurationScreenServices = {
  fetchIssuerIdentification,
  saveIssuerIdentification,
  fetchBuyerIdentificationThresholds,
  recordBuyerIdentificationThreshold,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
