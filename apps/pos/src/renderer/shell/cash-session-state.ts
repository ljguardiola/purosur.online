import type { SignedInPerson } from "../access/signed-in-person";

export type CashSessionState =
  | { status: "unknown" }
  | { status: "none" }
  | { status: "unavailable" }
  | { status: "open"; id: string; openedAt: string; openedBy: SignedInPerson };
