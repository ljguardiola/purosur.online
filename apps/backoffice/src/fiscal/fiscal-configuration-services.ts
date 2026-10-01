import { startAuthentication } from "@simplewebauthn/browser";
import { authorizeSession, fetchSessionAuthorizationOptions } from "../access/session-api";
import type { EditIssuerIdentificationModalServices } from "./edit-issuer-identification-modal";
import { fetchIssuerIdentification, saveIssuerIdentification } from "./issuer-identification-api";

export type FiscalConfigurationScreenServices = EditIssuerIdentificationModalServices & {
  fetchIssuerIdentification: typeof fetchIssuerIdentification;
};

export const defaultFiscalConfigurationScreenServices: FiscalConfigurationScreenServices = {
  fetchIssuerIdentification,
  saveIssuerIdentification,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
