import type {
  AssemblyBatchList,
  AssemblyBatchPreview,
  CurrentStockReportBody,
  CurrentStockReportQuery,
  ExpiringLotList,
  ExpiringLotsReportBody,
  ExpiringLotsReportQuery,
  InitialInventoryLotList,
  InitialInventoryLotsQuery,
  LossesByReasonReportBody,
  LossesByReasonReportQuery,
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
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { fetchCurrentZoneRules } from "../platform/zone-rules-api";
import type {
  AssemblyBatchPreviewRequest,
  fetchAssemblyBatches,
  fetchAssemblyBatchPreview,
} from "./assembly-batches-api";
import type { fetchCurrentStockReport } from "./current-stock-report-api";
import type { fetchExpiringLotsReport } from "./expiring-lots-report-api";
import type { fetchLossesByReasonReport } from "./losses-by-reason-report-api";
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
  currentReport: (query: CurrentStockReportQuery) =>
    [...stockKey, "current-report", query.category_id ?? ""] as const,
  products: [...stockKey, "products"] as const,
  expiringLots: [...stockKey, "expiring-lots"] as const,
  expiringLotsReport: (query: ExpiringLotsReportQuery) =>
    [...stockKey, "expiring-lots-report", query.from ?? "", query.to ?? ""] as const,
  lossesByReasonReport: (query: LossesByReasonReportQuery) =>
    [...stockKey, "losses-by-reason-report", query.from ?? "", query.to ?? ""] as const,
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
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<StockBalanceList>({
    queryKey: stockKeys.balances,
    read: params.fetchStockBalances,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useCurrentStockReportQuery(
  params: ReadParams & {
    query: CurrentStockReportQuery;
    fetchCurrentStockReport: typeof fetchCurrentStockReport;
  },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<CurrentStockReportBody>({
    queryKey: stockKeys.currentReport(params.query),
    keepPreviousData: true,
    read: () => params.fetchCurrentStockReport(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useExpiringLotsReportQuery(
  params: ReadParams & {
    query: ExpiringLotsReportQuery;
    fetchExpiringLotsReport: typeof fetchExpiringLotsReport;
  },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<ExpiringLotsReportBody>({
    queryKey: stockKeys.expiringLotsReport(params.query),
    keepPreviousData: true,
    read: () => params.fetchExpiringLotsReport(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useLossesByReasonReportQuery(
  params: ReadParams & {
    query: LossesByReasonReportQuery;
    fetchLossesByReasonReport: typeof fetchLossesByReasonReport;
  },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<LossesByReasonReportBody>({
    queryKey: stockKeys.lossesByReasonReport(params.query),
    keepPreviousData: true,
    read: () => params.fetchLossesByReasonReport(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useExpiringLotsQuery(
  params: ReadParams & { fetchExpiringLots: typeof fetchExpiringLots },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<ExpiringLotList>({
    queryKey: stockKeys.expiringLots,
    read: params.fetchExpiringLots,
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

export function useRecipesQuery(params: ReadParams & { fetchRecipes: typeof fetchRecipes }) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<RecipeList>({
    queryKey: stockKeys.recipes,
    read: params.fetchRecipes,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useAssemblyBatchesQuery(
  params: ReadParams & {
    days: StockPeriodDays;
    fetchAssemblyBatches: typeof fetchAssemblyBatches;
  },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<AssemblyBatchList>({
    queryKey: stockKeys.assemblyBatches(params.days),
    keepPreviousData: true,
    read: () => params.fetchAssemblyBatches(params.days),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useAssemblyBatchProposalQuery(
  params: ReadParams & {
    request: AssemblyBatchPreviewRequest | undefined;
    fetchAssemblyBatchPreview: typeof fetchAssemblyBatchPreview;
  },
) {
  const sendToMyAccount = useSendToMyAccount();
  const { request } = params;
  return useCloudQuery<AssemblyBatchPreview>({
    queryKey: stockKeys.assemblyBatchProposal(request ?? { productId: "", size: 0 }),
    enabled: request !== undefined,
    read: () =>
      request === undefined
        ? Promise.resolve({ kind: "failed" })
        : params.fetchAssemblyBatchPreview(request),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useAssemblyBatchLotQuery(
  params: ReadParams & {
    request: AssemblyBatchPreviewRequest | undefined;
    fetchAssemblyBatchPreview: typeof fetchAssemblyBatchPreview;
  },
) {
  const sendToMyAccount = useSendToMyAccount();
  const { request } = params;
  return useCloudQuery<AssemblyBatchPreview>({
    queryKey: stockKeys.assemblyBatchLot(request ?? { productId: "", size: 0 }),
    enabled: request !== undefined,
    read: () =>
      request === undefined
        ? Promise.resolve({ kind: "failed" })
        : params.fetchAssemblyBatchPreview(request),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
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
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<ZoneRules>({
    queryKey: stockKeys.zoneRules,
    read: params.fetchCurrentZoneRules,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}
