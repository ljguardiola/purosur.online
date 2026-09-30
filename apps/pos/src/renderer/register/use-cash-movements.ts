import type { ListedCashMovement } from "@purosur/contracts";
import type { CashMovementsState } from "./cash-movements-table";
import { useOpenSessionRead } from "./use-open-session-read";

export function useCashMovements(load: () => Promise<ListedCashMovement[] | null | "unavailable">) {
  const { state, retry, refresh } = useOpenSessionRead(load);
  const movements: CashMovementsState =
    "value" in state ? { status: state.status, movements: state.value } : state;
  return { state: movements, retry, refresh };
}
