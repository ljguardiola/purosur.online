import type {
  InitialInventoryLotList,
  InitialInventoryLotsQuery,
  StockBalanceList,
  StockCountList,
  StockMovementList,
  StockMovementReasonList,
  StockPeriodDays,
  StockProductBalance,
  StockProductList,
} from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type {
  fetchExpectedBalance,
  fetchInitialInventoryLots,
  fetchStockBalances,
  fetchStockCounts,
  fetchStockMovementReasons,
  fetchStockMovements,
  fetchStockProducts,
} from "./stock-api";

export const stockKey = ["stock"] as const;

export const stockKeys = {
  balances: [...stockKey, "balances"] as const,
  products: [...stockKey, "products"] as const,
  counts: (days: StockPeriodDays) => [...stockKey, "counts", days] as const,
  movements: (days: StockPeriodDays) => [...stockKey, "movements", days] as const,
  movementReasons: [...stockKey, "movement-reasons"] as const,
  expectedBalance: (productId: string, at: string) =>
    [...stockKey, "expected-balance", productId, at] as const,
  initialLots: ({ cost, product }: InitialInventoryLotsQuery) =>
    [...stockKey, "initial-lots", cost ?? "all", product ?? ""] as const,
};

type ReadParams = { onSessionEnded: () => void };

export function useStockBalancesQuery(
  params: ReadParams & { fetchStockBalances: typeof fetchStockBalances },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<StockBalanceList>({
    queryKey: stockKeys.balances,
    read: params.fetchStockBalances,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useStockProductsQuery(
  params: ReadParams & { fetchStockProducts: typeof fetchStockProducts },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<StockProductList>({
    queryKey: stockKeys.products,
    read: params.fetchStockProducts,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useStockCountsQuery(
  params: ReadParams & { days: StockPeriodDays; fetchStockCounts: typeof fetchStockCounts },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<StockCountList>({
    queryKey: stockKeys.counts(params.days),
    keepPreviousData: true,
    read: () => params.fetchStockCounts(params.days),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useStockMovementsQuery(
  params: ReadParams & { days: StockPeriodDays; fetchStockMovements: typeof fetchStockMovements },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<StockMovementList>({
    queryKey: stockKeys.movements(params.days),
    keepPreviousData: true,
    read: () => params.fetchStockMovements(params.days),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useStockMovementReasonsQuery(
  params: ReadParams & { fetchStockMovementReasons: typeof fetchStockMovementReasons },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<StockMovementReasonList>({
    queryKey: stockKeys.movementReasons,
    read: params.fetchStockMovementReasons,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useExpectedBalanceQuery(
  params: ReadParams & {
    productId: string;
    at: string;
    enabled: boolean;
    fetchExpectedBalance: typeof fetchExpectedBalance;
  },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<StockProductBalance>({
    queryKey: stockKeys.expectedBalance(params.productId, params.at),
    keepPreviousData: true,
    enabled: params.enabled,
    read: async () => {
      const outcome = await params.fetchExpectedBalance(params.productId, params.at);
      return outcome.kind === "not_found" ? { kind: "failed" } : outcome;
    },
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useInitialInventoryLotsQuery(
  params: ReadParams & {
    filters: InitialInventoryLotsQuery;
    fetchInitialInventoryLots: typeof fetchInitialInventoryLots;
  },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<InitialInventoryLotList>({
    queryKey: stockKeys.initialLots(params.filters),
    keepPreviousData: true,
    read: () => params.fetchInitialInventoryLots(params.filters),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRefreshStock(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: stockKey });
}
