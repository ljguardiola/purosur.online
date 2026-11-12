import type { RememberedPeople } from "./remembered-people.js";

export interface ListSignInUsersPorts {
  rememberedPeople: Pick<RememberedPeople, "signInCandidates">;
}

export interface SignInUsers {
  users: { id: string; firstName: string }[];
  lastActiveUserId: string | null;
}

export function listSignInUsers({ rememberedPeople }: ListSignInUsersPorts): SignInUsers {
  const candidates = rememberedPeople.signInCandidates();
  return {
    users: candidates.map(({ id, firstName }) => ({ id, firstName })),
    lastActiveUserId: candidates.find(({ lastActive }) => lastActive)?.id ?? null,
  };
}
