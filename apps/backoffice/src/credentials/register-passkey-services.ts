import { startRegistration } from "@simplewebauthn/browser";
import { signalUnknownCredential } from "../platform/signal-unknown-credential";
import { fetchRegistrationOptions, redeemRecovery } from "./recovery-api";

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
