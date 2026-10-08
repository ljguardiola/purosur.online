import { startAuthentication } from "@simplewebauthn/browser";
import { signalUnknownCredential } from "../platform/signal-unknown-credential";
import { authenticate, fetchAuthenticationOptions } from "./session-api";

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
