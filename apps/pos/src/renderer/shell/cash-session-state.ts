import type { SignedInPerson } from "../access/signed-in-person";

export type CashSessionState =
  | { status: "unknown" }
  | { status: "none" }
  | { status: "unavailable" }
  | { status: "open"; openedAt: string; openedBy: SignedInPerson };
