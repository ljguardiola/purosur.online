import type { RegisterCloses } from "./register-closes.js";

export interface SuggestOpeningFloatPorts {
  closes: RegisterCloses;
}

export type OpeningFloatSuggestion =
  | { kind: "previous_close"; closedAt: Date; countedCash: number }
  | { kind: "none" };

export function suggestOpeningFloat({ closes }: SuggestOpeningFloatPorts): OpeningFloatSuggestion {
  const identity = closes.registerIdentity();
  if (identity === undefined) {
    return { kind: "none" };
  }
  const previous = closes
    .latestCloseOfEachRegister()
    .find((close) => close.registerId === identity.registerId);
  return previous === undefined
    ? { kind: "none" }
    : { kind: "previous_close", closedAt: previous.closedAt, countedCash: previous.countedCash };
}
