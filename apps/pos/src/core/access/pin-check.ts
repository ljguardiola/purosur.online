import { timingSafeEqual } from "node:crypto";
import { decodePinSalt } from "@purosur/domain";
import { derivePinVerifier } from "./pin-verifier";
import type { SignInRecord, SignInStore } from "./sqlite-sign-in-store";

export interface PinCheckDeps {
  store: Pick<SignInStore, "signInRecord">;
  readPepper: () => Promise<string | undefined>;
  hashPin: (pin: string, salt: Uint8Array) => Promise<string>;
}

export type PinCheck =
  | { kind: "right_pin"; record: SignInRecord }
  | { kind: "wrong_pin" }
  | { kind: "unavailable" };

function sameText(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function pinMatches(pepper: string, pinHash: string, record: SignInRecord): boolean {
  return sameText(derivePinVerifier(pepper, pinHash), record.verifier);
}

export async function checkPin(deps: PinCheckDeps, userId: string, pin: string): Promise<PinCheck> {
  const record = deps.store.signInRecord(userId);
  const salt = record === undefined ? undefined : decodePinSalt(record.salt);
  if (record === undefined || salt === undefined) {
    return { kind: "wrong_pin" };
  }
  const pepper = await deps.readPepper();
  if (pepper === undefined) {
    return { kind: "unavailable" };
  }
  return pinMatches(pepper, await deps.hashPin(pin, salt), record)
    ? { kind: "right_pin", record }
    : { kind: "wrong_pin" };
}
