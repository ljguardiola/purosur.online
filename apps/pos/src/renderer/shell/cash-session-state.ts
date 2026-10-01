import type { OpenCashSession } from "@purosur/contracts";
import type { SignedInPerson } from "../access/signed-in-person";

export type CashSessionState =
  | { status: "unknown" }
  | { status: "none" }
  | { status: "unavailable" }
  | { status: "open"; id: string; openedAt: string; openedBy: SignedInPerson; locked: boolean };

export function cashSessionStateOf(
  session: OpenCashSession | null | "unavailable",
): CashSessionState {
  if (session === "unavailable") {
    return { status: "unavailable" };
  }
  return session === null
    ? { status: "none" }
    : {
        status: "open",
        id: session.id,
        openedAt: session.opened_at,
        openedBy: session.opened_by,
        locked: session.locked,
      };
}
