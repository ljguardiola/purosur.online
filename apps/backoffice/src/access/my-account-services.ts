import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { EmitUserPinCodeModalServices } from "./emit-user-pin-code-modal";
import {
  fetchPasskeyRegistrationChallenge,
  fetchPasskeys,
  registerPasskey,
  removePasskey,
} from "./passkey-api";
import type { RegisterOwnPasskeyModalServices } from "./register-own-passkey-modal";
import type { RemoveOwnPasskeyModalServices } from "./remove-own-passkey-modal";
import { signalUnknownCredential } from "./signal-unknown-credential";
import { emitUserPinCode } from "./users-api";

export type MyAccountScreenServices = {
  fetchPasskeys: typeof fetchPasskeys;
} & RegisterOwnPasskeyModalServices &
  RemoveOwnPasskeyModalServices &
  EmitUserPinCodeModalServices;

export const defaultMyAccountScreenServices: MyAccountScreenServices = {
  fetchPasskeys,
  fetchPasskeyRegistrationChallenge,
  registerPasskey,
  removePasskey,
  emitUserPinCode,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
  startRegistration,
  signalUnknownCredential,
};
