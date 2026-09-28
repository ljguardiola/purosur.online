import { startRegistration } from "@simplewebauthn/browser";
import { fetchRegistrationOptions, redeemRecovery } from "./recovery-api";
import { signalUnknownCredential } from "./signal-unknown-credential";

export type RegisterPasskeyScreenServices = {
  fetchRegistrationOptions: typeof fetchRegistrationOptions;
  redeemRecovery: typeof redeemRecovery;
  startRegistration: typeof startRegistration;
  signalUnknownCredential: typeof signalUnknownCredential;
};

export const defaultRegisterPasskeyScreenServices: RegisterPasskeyScreenServices = {
  fetchRegistrationOptions,
  redeemRecovery,
  startRegistration,
  signalUnknownCredential,
};
