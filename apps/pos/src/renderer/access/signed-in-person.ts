import type { SignInOutcome } from "@purosur/contracts";

export type SignedInPerson = Extract<SignInOutcome, { kind: "signed_in" }>["person"];
