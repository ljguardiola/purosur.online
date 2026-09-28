import { startAuthentication } from "@simplewebauthn/browser";
import { authenticate, fetchAuthenticationOptions } from "./session-api";
import { signalUnknownCredential } from "./signal-unknown-credential";

export type SignInScreenServices = {
  fetchAuthenticationOptions: typeof fetchAuthenticationOptions;
  authenticate: typeof authenticate;
  startAuthentication: typeof startAuthentication;
  signalUnknownCredential: typeof signalUnknownCredential;
};

export const defaultSignInScreenServices: SignInScreenServices = {
  fetchAuthenticationOptions,
  authenticate,
  startAuthentication,
  signalUnknownCredential,
};
