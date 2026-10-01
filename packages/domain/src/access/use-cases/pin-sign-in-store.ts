import type { RoleAccess } from "../model/access-increase.js";
import type { Clock } from "./pin-code-store.js";

export interface PinSignInFailures {
  consecutiveFailures: number;
  lastFailedAt: Date;
}

export interface PinHolder<Credential> {
  firstName: string;
  access: RoleAccess;
  credential: Credential;
}

export interface PinSignInStore<Credential> {
  pinHolder(userId: string): PinHolder<Credential> | undefined;
  pinSignInFailures(userId: string): PinSignInFailures | undefined;
  recordPinSignInFailure(userId: string, at: Date): PinSignInFailures;
  withdrawPinSignInFailure(userId: string): void;
  clearPinSignInFailures(userId: string): void;
}

export interface PinMatcher<Credential> {
  matches(pin: string, credential: Credential): Promise<boolean>;
}

export interface PinMatching<Credential> {
  matcher(): Promise<PinMatcher<Credential> | undefined>;
}

export interface PinCheckPorts<Credential> {
  store: PinSignInStore<Credential>;
  matching: PinMatching<Credential>;
  clock: Clock;
}
