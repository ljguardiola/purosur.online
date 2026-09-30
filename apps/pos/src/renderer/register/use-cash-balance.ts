import type { CashBalance } from "@purosur/contracts";
import type { CashBalanceState } from "./expected-cash-panel";
import { useOpenSessionRead } from "./use-open-session-read";

export function useCashBalance(load: () => Promise<CashBalance | null | "unavailable">) {
  const { state, retry, refresh } = useOpenSessionRead(load);
  const balance: CashBalanceState =
    "value" in state ? { status: "loaded", balance: state.value } : state;
  return { state: balance, retry, refresh };
}
