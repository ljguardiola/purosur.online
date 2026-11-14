import type { CloseCashSessionOutcome, ListedCashMovement } from "@purosur/contracts";

export type ClosedCashSummary = {
  session: Extract<CloseCashSessionOutcome, { kind: "closed" }>["session"];
  movements: ListedCashMovement[];
};
