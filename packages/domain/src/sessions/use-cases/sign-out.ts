import type { SessionStore } from "./session-store.js";

export interface SignOutPorts {
  store: SessionStore;
}

export interface SignOutInput {
  sessionKey: string;
  at: Date;
}

export type SignOutOutcome = { kind: "signed_out" };

export async function signOut(
  { store }: SignOutPorts,
  input: SignOutInput,
): Promise<SignOutOutcome> {
  await store.endSession(input.sessionKey, input.at);
  return { kind: "signed_out" };
}
