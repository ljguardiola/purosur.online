import { timingSafeEqual } from "node:crypto";
import type {
  PinCheckPorts,
  PinMatching,
  PinSignInStore,
} from "@purosur/domain/sessions/use-cases";
import { derivePinVerifier } from "../credentials/pin-verifier";

export interface PinCredential {
  salt: Uint8Array;
  verifier: string;
}

export interface PinMatchingDeps {
  readPepper: () => Promise<string | undefined>;
  hashPin: (pin: string, salt: Uint8Array) => Promise<string>;
}

function sameText(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function createPinMatching({
  readPepper,
  hashPin,
}: PinMatchingDeps): PinMatching<PinCredential> {
  return {
    async matcher() {
      const pepper = await readPepper();
      if (pepper === undefined) {
        return undefined;
      }
      return {
        async matches(pin, { salt, verifier }) {
          return sameText(derivePinVerifier(pepper, await hashPin(pin, salt)), verifier);
        },
      };
    },
  };
}

export interface PinCheckDeps extends PinMatchingDeps {
  store: PinSignInStore<PinCredential>;
  now: () => Date;
}

export function pinCheckPorts(deps: PinCheckDeps): PinCheckPorts<PinCredential> {
  return { store: deps.store, matching: createPinMatching(deps), clock: { now: deps.now } };
}
