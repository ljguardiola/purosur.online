import type {
  CashBalance,
  CashCountPreview,
  ListedCashMovement,
  OpenCashSession,
  RecordableCashMovementKinds,
  RegisterStatus,
  SessionOpenSale,
  SignInUser,
} from "@purosur/contracts";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { setQueryAnswer } from "../platform/set-query-answer";
import type { CoreData } from "../platform/use-core-query";
import { coreQueryOptions, useCoreQuery } from "../platform/use-core-query";
import type { CashSessionState } from "./cash-session-state";
import { cashSessionStateOf } from "./cash-session-state";

const registerKey = ["register"] as const;

export const cashKey = [...registerKey, "cash"] as const;

export const lockedClosersKey = [...registerKey, "locked-closers"] as const;

export const registerKeys = {
  enrollment: [...registerKey, "enrollment"] as const,
  service: [...registerKey, "service"] as const,
  cashSession: [...registerKey, "cash-session"] as const,
  registerName: [...registerKey, "register-name"] as const,
  status: [...registerKey, "status"] as const,
  lockedClosers: (sessionId: string) => [...lockedClosersKey, sessionId] as const,
  cashBalance: (sessionId: string) => [...cashKey, sessionId, "balance"] as const,
  cashCountPreview: (sessionId: string, countedCash: number | undefined) =>
    [...cashKey, sessionId, "count-preview", countedCash] as const,
  cashMovements: (sessionId: string) => [...cashKey, sessionId, "movements"] as const,
  openSale: (sessionId: string) => [...cashKey, sessionId, "open-sale"] as const,
  cashMovementKinds: (userId: string) => [...registerKey, "cash-movement-kinds", userId] as const,
};

const CASH_SESSION_REREAD_MS = 5000;

const UNKNOWN_SESSION: CashSessionState = { status: "unknown" };

function answeredOrLoading<T>(data: CoreData<T | null>): CoreData<T> {
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

export function useRegisterServiceQuery({
  read,
  enabled,
}: {
  read: () => Promise<"in_service" | "out_of_service">;
  enabled: boolean;
}): CoreData<"in_service" | "out_of_service"> {
  return useCoreQuery({ queryKey: registerKeys.service, read, enabled });
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
  return coreQueryOptions({ queryKey: registerKeys.registerName, read, staleTime: Infinity });
}

export function useRegisterNameQuery(read: () => Promise<string | null>): string | null {
  const name = useCoreQuery({ queryKey: registerKeys.registerName, read, staleTime: Infinity });
  return name.status === "loaded" ? name.value : null;
}

export function useRegisterStatusQuery(
  read: () => Promise<RegisterStatus | "unavailable">,
): CoreData<RegisterStatus> {
  return useCoreQuery({ queryKey: registerKeys.status, read });
}

export function useLockedClosersQuery(
  sessionId: string,
  read: () => Promise<SignInUser[]>,
): CoreData<SignInUser[]> {
  return useCoreQuery({ queryKey: registerKeys.lockedClosers(sessionId), read });
}

export function useCashBalanceQuery(
  sessionId: string,
  read: () => Promise<CashBalance | null | "unavailable">,
): CoreData<CashBalance> {
  return answeredOrLoading(useCoreQuery({ queryKey: registerKeys.cashBalance(sessionId), read }));
}

export function useCashCountPreviewQuery(
  sessionId: string,
  countedCash: number | undefined,
  read: (countedCash: number) => Promise<CashCountPreview | null | "unavailable">,
): number | undefined {
  const query = useQuery({
    ...coreQueryOptions({
      queryKey: registerKeys.cashCountPreview(sessionId, countedCash),
      read: async () => (countedCash === undefined ? "unavailable" : read(countedCash)),
    }),
    enabled: countedCash !== undefined,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey.at(cashKey.length) === sessionId ? previous : undefined,
  });
  return countedCash === undefined ? undefined : query.data?.difference;
}

export function useCashMovementsQuery(
  sessionId: string,
  read: () => Promise<ListedCashMovement[] | null | "unavailable">,
): CoreData<ListedCashMovement[]> {
  return answeredOrLoading(useCoreQuery({ queryKey: registerKeys.cashMovements(sessionId), read }));
}

export function useCashMovementKindsQuery(
  userId: string,
  read: () => Promise<RecordableCashMovementKinds | null | "unavailable">,
): CoreData<RecordableCashMovementKinds> {
  return answeredOrLoading(
    useCoreQuery({ queryKey: registerKeys.cashMovementKinds(userId), read }),
  );
}

export function useSessionOpenSaleQuery(
  sessionId: string,
  read: () => Promise<SessionOpenSale | null | "unavailable">,
): CoreData<SessionOpenSale | null> {
  return useCoreQuery({ queryKey: registerKeys.openSale(sessionId), read });
}

export function useRefreshSessionOpenSale(sessionId: string): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => {
    const queryKey = registerKeys.openSale(sessionId);
    return queryClient
      .invalidateQueries({ queryKey }, { throwOnError: true })
      .catch(() => queryClient.resetQueries({ queryKey }));
  };
}

export function useSetSessionOpenSale(
  sessionId: string,
): (sale: SessionOpenSale | null) => Promise<void> {
  const queryClient = useQueryClient();
  return (sale) => setQueryAnswer(queryClient, registerKeys.openSale(sessionId), sale);
}
