import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import {
  fetchPasskeyRegistrationChallenge,
  fetchPasskeys,
  registerPasskey,
  removePasskey,
} from "./passkey-api";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./session-api";
import { signalUnknownCredential } from "./signal-unknown-credential";

export type MyAccountScreenServices = {
  fetchPasskeys: typeof fetchPasskeys;
  fetchPasskeyRegistrationChallenge: typeof fetchPasskeyRegistrationChallenge;
  registerPasskey: typeof registerPasskey;
  removePasskey: typeof removePasskey;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
  startRegistration: typeof startRegistration;
  signalUnknownCredential: typeof signalUnknownCredential;
};

export const defaultMyAccountScreenServices: MyAccountScreenServices = {
  fetchPasskeys,
  fetchPasskeyRegistrationChallenge,
  registerPasskey,
  removePasskey,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
  startRegistration,
  signalUnknownCredential,
};
