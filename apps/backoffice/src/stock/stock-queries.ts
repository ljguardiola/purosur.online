import type {
  AssemblyBatchList,
  AssemblyBatchPreview,
  ExpiringLotList,
  ExpiringLotsReportBody,
  ExpiringLotsReportQuery,
  InitialInventoryLotList,
  InitialInventoryLotsQuery,
  LossesByReasonReportBody,
  LossesByReasonReportQuery,
  MarginReportBody,
  MarginReportQuery,
  RecipeList,
  StockBalanceList,
  StockCountList,
  StockMovementList,
  StockMovementReasonList,
  StockPeriodDays,
  StockProductBalance,
  StockProductList,
} from "@purosur/contracts";
import type { ZoneRules } from "@purosur/domain";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToOwnAccount } from "../platform/send-to-own-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { fetchCurrentZoneRules } from "../platform/zone-rules-api";
import type {
  AssemblyBatchPreviewRequest,
  fetchAssemblyBatches,
  fetchAssemblyBatchPreview,
} from "./assembly-batches-api";
import type { fetchExpiringLotsReport } from "./expiring-lots-report-api";
import type { fetchLossesByReasonReport } from "./losses-by-reason-report-api";
import type { fetchMarginReport } from "./margin-report-api";
import type { fetchRecipes } from "./recipes-api";
import type {
  fetchExpectedBalance,
  fetchExpiringLots,
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
  expiringLots: [...stockKey, "expiring-lots"] as const,
  expiringLotsReport: (query: ExpiringLotsReportQuery) =>
    [...stockKey, "expiring-lots-report", query.from ?? "", query.to ?? ""] as const,
  lossesByReasonReport: (query: LossesByReasonReportQuery) =>
    [...stockKey, "losses-by-reason-report", query.from ?? "", query.to ?? ""] as const,
  marginReport: (query: MarginReportQuery) =>
    [
      ...stockKey,
      "margin-report",
      query.group,
      query.from ?? "",
      query.to ?? "",
      query.register_id ?? "",
    ] as const,
  recipes: [...stockKey, "recipes"] as const,
  assemblyBatches: (days: StockPeriodDays) => [...stockKey, "assembly-batches", days] as const,
  assemblyBatchProposal: ({ productId, size }: AssemblyBatchPreviewRequest) =>
    [...stockKey, "assembly-batch-proposal", productId, size] as const,
  assemblyBatchLot: ({ productId, size, used, output }: AssemblyBatchPreviewRequest) =>
    [...stockKey, "assembly-batch-lot", productId, size, used ?? [], output ?? null] as const,
  counts: (days: StockPeriodDays) => [...stockKey, "counts", days] as const,
  movements: (days: StockPeriodDays) => [...stockKey, "movements", days] as const,
  movementReasons: [...stockKey, "movement-reasons"] as const,
  expectedBalance: (productId: string, at: string) =>
    [...stockKey, "expected-balance", productId, at] as const,
  zoneRules: [...stockKey, "zone-rules"] as const,
  initialLots: ({ cost, product }: InitialInventoryLotsQuery) =>
    [...stockKey, "initial-lots", cost ?? "all", product ?? ""] as const,
};

type ReadParams = { onSessionEnded: () => void };

export function useStockBalancesQuery(
  params: ReadParams & { fetchStockBalances: typeof fetchStockBalances },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<StockBalanceList>({
    queryKey: stockKeys.balances,
    read: params.fetchStockBalances,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useExpiringLotsReportQuery(
  params: ReadParams & {
    query: ExpiringLotsReportQuery;
    fetchExpiringLotsReport: typeof fetchExpiringLotsReport;
  },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<ExpiringLotsReportBody>({
    queryKey: stockKeys.expiringLotsReport(params.query),
    keepPreviousData: true,
    read: () => params.fetchExpiringLotsReport(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useLossesByReasonReportQuery(
  params: ReadParams & {
    query: LossesByReasonReportQuery;
    fetchLossesByReasonReport: typeof fetchLossesByReasonReport;
  },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<LossesByReasonReportBody>({
    queryKey: stockKeys.lossesByReasonReport(params.query),
    keepPreviousData: true,
    read: () => params.fetchLossesByReasonReport(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useMarginReportQuery(
  params: ReadParams & {
    query: MarginReportQuery;
    fetchMarginReport: typeof fetchMarginReport;
  },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<MarginReportBody>({
    queryKey: stockKeys.marginReport(params.query),
    keepPreviousData: true,
    read: () => params.fetchMarginReport(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useExpiringLotsQuery(
  params: ReadParams & { fetchExpiringLots: typeof fetchExpiringLots },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<ExpiringLotList>({
    queryKey: stockKeys.expiringLots,
    read: params.fetchExpiringLots,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useStockProductsQuery(
  params: ReadParams & { fetchStockProducts: typeof fetchStockProducts },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<StockProductList>({
    queryKey: stockKeys.products,
    read: params.fetchStockProducts,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useStockCountsQuery(
  params: ReadParams & {
    days: StockPeriodDays;
    fetchStockCounts: typeof fetchStockCounts;
    enabled?: boolean;
  },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<StockCountList>({
    queryKey: stockKeys.counts(params.days),
    keepPreviousData: true,
    enabled: params.enabled ?? true,
    read: () => params.fetchStockCounts(params.days),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useStockMovementsQuery(
  params: ReadParams & {
    days: StockPeriodDays;
    fetchStockMovements: typeof fetchStockMovements;
    enabled?: boolean;
  },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<StockMovementList>({
    queryKey: stockKeys.movements(params.days),
    keepPreviousData: true,
    enabled: params.enabled ?? true,
    read: () => params.fetchStockMovements(params.days),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useStockMovementReasonsQuery(
  params: ReadParams & { fetchStockMovementReasons: typeof fetchStockMovementReasons },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<StockMovementReasonList>({
    queryKey: stockKeys.movementReasons,
    read: params.fetchStockMovementReasons,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
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
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<StockProductBalance>({
    queryKey: stockKeys.expectedBalance(params.productId, params.at),
    keepPreviousData: true,
    enabled: params.enabled,
    read: async () => {
      const outcome = await params.fetchExpectedBalance(params.productId, params.at);
      return outcome.kind === "not_found" ? { kind: "failed" } : outcome;
    },
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useInitialInventoryLotsQuery(
  params: ReadParams & {
    filters: InitialInventoryLotsQuery;
    fetchInitialInventoryLots: typeof fetchInitialInventoryLots;
  },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<InitialInventoryLotList>({
    queryKey: stockKeys.initialLots(params.filters),
    keepPreviousData: true,
    read: () => params.fetchInitialInventoryLots(params.filters),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useRecipesQuery(
  params: ReadParams & { fetchRecipes: typeof fetchRecipes; enabled?: boolean },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<RecipeList>({
    queryKey: stockKeys.recipes,
    enabled: params.enabled ?? true,
    read: params.fetchRecipes,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useAssemblyBatchesQuery(
  params: ReadParams & {
    days: StockPeriodDays;
    fetchAssemblyBatches: typeof fetchAssemblyBatches;
    enabled?: boolean;
  },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<AssemblyBatchList>({
    queryKey: stockKeys.assemblyBatches(params.days),
    enabled: params.enabled ?? true,
    keepPreviousData: true,
    read: () => params.fetchAssemblyBatches(params.days),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useAssemblyBatchProposalQuery(
  params: ReadParams & {
    request: AssemblyBatchPreviewRequest | undefined;
    fetchAssemblyBatchPreview: typeof fetchAssemblyBatchPreview;
  },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  const { request } = params;
  return useCloudQuery<AssemblyBatchPreview>({
    queryKey: stockKeys.assemblyBatchProposal(request ?? { productId: "", size: 0 }),
    enabled: request !== undefined,
    read: () =>
      request === undefined
        ? Promise.resolve({ kind: "failed" })
        : params.fetchAssemblyBatchPreview(request),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useAssemblyBatchLotQuery(
  params: ReadParams & {
    request: AssemblyBatchPreviewRequest | undefined;
    fetchAssemblyBatchPreview: typeof fetchAssemblyBatchPreview;
  },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  const { request } = params;
  return useCloudQuery<AssemblyBatchPreview>({
    queryKey: stockKeys.assemblyBatchLot(request ?? { productId: "", size: 0 }),
    enabled: request !== undefined,
    read: () =>
      request === undefined
        ? Promise.resolve({ kind: "failed" })
        : params.fetchAssemblyBatchPreview(request),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useMarkStockStale(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: stockKey, refetchType: "none" });
}

export function useRefreshStock(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: stockKey });
}

export function useCountZoneRulesQuery(
  params: ReadParams & { fetchCurrentZoneRules: typeof fetchCurrentZoneRules },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<ZoneRules>({
    queryKey: stockKeys.zoneRules,
    read: params.fetchCurrentZoneRules,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}
