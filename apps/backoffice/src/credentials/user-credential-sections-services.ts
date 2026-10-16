import { startAuthentication } from "@simplewebauthn/browser";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { EmitUserPinCodeModalServices } from "./emit-user-pin-code-modal";
import type { RemoveEveryUserPasskeyModalServices } from "./remove-every-user-passkey-modal";
import type { RemoveUserPasskeyModalServices } from "./remove-user-passkey-modal";
import {
  emitUserPinCode,
  fetchUserPasskeys,
  removeEveryUserPasskey,
  removeUserPasskey,
} from "./user-credentials-api";

export type UserCredentialSectionsServices = {
  fetchUserPasskeys: typeof fetchUserPasskeys;
} & RemoveUserPasskeyModalServices &
  RemoveEveryUserPasskeyModalServices &
  EmitUserPinCodeModalServices;

export const defaultUserCredentialSectionsServices: UserCredentialSectionsServices = {
  fetchUserPasskeys,
  removeUserPasskey,
  removeEveryUserPasskey,
  emitUserPinCode,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
