import type { CashBalance, ListedCashMovement, OpenCashSession } from "@purosur/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { CoreData } from "../platform/use-core-query";
import { coreQueryOptions, useCoreQuery } from "../platform/use-core-query";
import type { CashSessionState } from "../shell/cash-session-state";
import { cashSessionStateOf } from "../shell/cash-session-state";

const registerKey = ["register"] as const;

export const cashKey = [...registerKey, "cash"] as const;

export const registerKeys = {
  enrollment: [...registerKey, "enrollment"] as const,
  cashSession: [...registerKey, "cash-session"] as const,
  registerName: [...registerKey, "register-name"] as const,
  cashBalance: (sessionId: string) => [...cashKey, sessionId, "balance"] as const,
  cashMovements: (sessionId: string) => [...cashKey, sessionId, "movements"] as const,
};

const CASH_SESSION_REREAD_MS = 5000;

const UNKNOWN_SESSION: CashSessionState = { status: "unknown" };

function onlyWithOpenSession<T>(data: CoreData<T | null>): CoreData<T> {
  if (data.status !== "loaded") {
    return data;
  }
  return data.value === null ? { status: "loading" } : { ...data, value: data.value };
}

export function useEnrollmentQuery({
  read,
  enabled,
}: {
  read: () => Promise<boolean>;
  enabled: boolean;
}): CoreData<boolean> {
  return useCoreQuery({ queryKey: registerKeys.enrollment, read, enabled });
}

export function cashSessionQueryOptions(
  read: () => Promise<OpenCashSession | null | "unavailable">,
) {
  return queryOptions({
    queryKey: registerKeys.cashSession,
    queryFn: async () => cashSessionStateOf(await read()),
    refetchInterval: (query) =>
      query.state.data?.status === "unavailable" ? CASH_SESSION_REREAD_MS : false,
    refetchIntervalInBackground: true,
  });
}

export function useCashSessionQuery({
  read,
  enabled,
}: {
  read: () => Promise<OpenCashSession | null | "unavailable">;
  enabled: boolean;
}): CashSessionState {
  const query = useQuery({ ...cashSessionQueryOptions(read), enabled });
  return enabled ? (query.data ?? UNKNOWN_SESSION) : UNKNOWN_SESSION;
}

export function registerNameQueryOptions(read: () => Promise<string | null>) {
  return coreQueryOptions({ queryKey: registerKeys.registerName, read });
}

export function useRegisterNameQuery(read: () => Promise<string | null>): string | null {
  const name = useCoreQuery({ queryKey: registerKeys.registerName, read });
  return name.status === "loaded" ? name.value : null;
}

export function useCashBalanceQuery(
  sessionId: string,
  read: () => Promise<CashBalance | null | "unavailable">,
): CoreData<CashBalance> {
  return onlyWithOpenSession(useCoreQuery({ queryKey: registerKeys.cashBalance(sessionId), read }));
}

export function useCashMovementsQuery(
  sessionId: string,
  read: () => Promise<ListedCashMovement[] | null | "unavailable">,
): CoreData<ListedCashMovement[]> {
  return onlyWithOpenSession(
    useCoreQuery({ queryKey: registerKeys.cashMovements(sessionId), read }),
  );
}
