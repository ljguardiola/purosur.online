import type { OpenCashSession, SignInOutcome } from "@purosur/contracts";
import { signInAtRegister } from "@purosur/domain/access/use-cases";
import { signInAnswer } from "./access-outcomes";
import { type PinCheckDeps, pinCheckPorts } from "./pin-matching";
import type { SignedInPerson } from "./signed-in-person";
import type { SignInStore } from "./sqlite-sign-in-store";

export interface SignInDeps extends PinCheckDeps {
  store: PinCheckDeps["store"] & Pick<SignInStore, "remember">;
  signedInPerson: Pick<SignedInPerson, "set" | "clear">;
  openCashSession: () => { openedBy: string } | undefined;
  cashSession: (signedInPersonId: string) => OpenCashSession | null;
}

export function signIn(deps: SignInDeps, userId: string, pin: string): Promise<SignInOutcome> {
  return signInRemembering(deps, userId, pin, false);
}

export function firstSignIn(deps: SignInDeps, userId: string, pin: string): Promise<SignInOutcome> {
  return signInRemembering(deps, userId, pin, true);
}

async function signInRemembering(
  deps: SignInDeps,
  userId: string,
  pin: string,
  remember: boolean,
): Promise<SignInOutcome> {
  return signInAnswer(
    await signInAtRegister(
      {
        ...pinCheckPorts(deps),
        signedInPerson: deps.signedInPerson,
        register: { openSession: deps.openCashSession, sessionToResume: deps.cashSession },
        rememberedPeople: { remember: (rememberedId) => deps.store.remember(rememberedId) },
      },
      { userId, pin, remember },
    ),
  );
}
