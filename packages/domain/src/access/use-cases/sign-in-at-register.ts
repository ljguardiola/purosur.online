import {
  isLockedToAnother,
  type RegisterAbility,
  registerAbilities,
} from "../../register/index.js";
import { pinSignInAttemptsLeft } from "../model/pin-sign-in-failures.js";
import { holdsARegisterPermission } from "../model/register-coverage.js";
import { checkPin, type PinRefusal } from "./check-pin.js";
import type { PinCheckPorts } from "./pin-sign-in-store.js";

export interface SignInAtRegisterPorts<Credential, Session> extends PinCheckPorts<Credential> {
  signedInPerson: { clear(): void; set(userId: string): void };
  register: {
    openSession(): { openedBy: string } | undefined;
    sessionToResume(userId: string): Session;
  };
  rememberedPeople: { remember(userId: string): void };
}

export interface SignInAtRegisterInput {
  userId: string;
  pin: string;
  remember: boolean;
}

export type SignInAtRegisterOutcome<Session> =
  | {
      kind: "signed_in";
      person: { userId: string; firstName: string; abilities: RegisterAbility[] };
      resumedSession: Session;
    }
  | { kind: "cash_session_opened_by_another" }
  | { kind: "no_register_permission" }
  | PinRefusal
  | { kind: "unavailable" };

export async function signInAtRegister<Credential, Session>(
  ports: SignInAtRegisterPorts<Credential, Session>,
  { userId, pin, remember }: SignInAtRegisterInput,
): Promise<SignInAtRegisterOutcome<Session>> {
  const { store, signedInPerson, register, rememberedPeople } = ports;
  signedInPerson.clear();
  if (isLockedToAnother(register.openSession(), userId)) {
    return { kind: "cash_session_opened_by_another" };
  }
  const holder = store.pinHolder(userId);
  if (holder === undefined) {
    return { kind: "wrong_pin", retryAfterSeconds: 0, attemptsLeft: pinSignInAttemptsLeft(1) };
  }
  const check = await checkPin(ports, { userId, credential: holder.credential, pin });
  if (check.kind !== "right_pin") {
    return check;
  }
  if (!holdsARegisterPermission(holder.access)) {
    return { kind: "no_register_permission" };
  }
  if (isLockedToAnother(register.openSession(), userId)) {
    return { kind: "cash_session_opened_by_another" };
  }
  const resumedSession = register.sessionToResume(userId);
  if (remember) {
    rememberedPeople.remember(userId);
  }
  signedInPerson.set(userId);
  return {
    kind: "signed_in",
    person: { userId, firstName: holder.firstName, abilities: registerAbilities(holder.access) },
    resumedSession,
  };
}
