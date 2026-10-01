import type { CashBalance, ListedCashMovement } from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import type { CoreData } from "../platform/use-core-query";
import { useCoreQuery } from "../platform/use-core-query";

const registerKey = ["register"] as const;

const cashKey = [...registerKey, "cash"] as const;

const registerKeys = {
  cashBalance: [...cashKey, "balance"] as const,
  cashMovements: [...cashKey, "movements"] as const,
};

function onlyWithOpenSession<T>(data: CoreData<T | null>): CoreData<T> {
  if (data.status !== "loaded") {
    return data;
  }
  return data.value === null ? { status: "loading" } : { ...data, value: data.value };
}

export function useCashBalanceQuery(
  read: () => Promise<CashBalance | null | "unavailable">,
): CoreData<CashBalance> {
  return onlyWithOpenSession(useCoreQuery({ queryKey: registerKeys.cashBalance, read }));
}

export function useCashMovementsQuery(
  read: () => Promise<ListedCashMovement[] | null | "unavailable">,
): CoreData<ListedCashMovement[]> {
  return onlyWithOpenSession(useCoreQuery({ queryKey: registerKeys.cashMovements, read }));
}

export function useRefreshCash(): () => void {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: cashKey });
}
