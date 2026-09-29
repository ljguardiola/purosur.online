import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import {
  fetchPasskeyRegistrationChallenge,
  fetchPasskeys,
  registerPasskey,
  removePasskey,
} from "./passkey-api";
import type { RegisterOwnPasskeyModalServices } from "./register-own-passkey-modal";
import type { RemoveOwnPasskeyModalServices } from "./remove-own-passkey-modal";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./session-api";
import { signalUnknownCredential } from "./signal-unknown-credential";

export type MyAccountScreenServices = {
  fetchPasskeys: typeof fetchPasskeys;
} & RegisterOwnPasskeyModalServices &
  RemoveOwnPasskeyModalServices;

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
