import { startAuthentication } from "@simplewebauthn/browser";
import { authorizeSession, fetchSessionAuthorizationOptions } from "../access/session-api";
import { fetchIssuerIdentification, saveIssuerIdentification } from "./issuer-identification-api";

export type FiscalConfigurationScreenServices = {
  fetchIssuerIdentification: typeof fetchIssuerIdentification;
  saveIssuerIdentification: typeof saveIssuerIdentification;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

export const defaultFiscalConfigurationScreenServices: FiscalConfigurationScreenServices = {
  fetchIssuerIdentification,
  saveIssuerIdentification,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
