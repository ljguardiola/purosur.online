import type {
  AverageTicketBody,
  CashRoundingBody,
  HandTypedWeightsBody,
  ManualDiscountsBody,
  ManualDiscountsQuery,
  ReportQuery,
  SalesByCashierBody,
  SalesByProductAndCategoryBody,
  SalesByProductAndCategoryQuery,
  SalesByPromotionBody,
  SalesReportBody,
} from "@purosur/contracts";
import { useSendToOwnAccount } from "../platform/send-to-own-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type {
  fetchAverageTicket,
  fetchCashRounding,
  fetchHandTypedWeights,
  fetchManualDiscounts,
  fetchSalesByCashier,
  fetchSalesByProductAndCategory,
  fetchSalesByPromotion,
  fetchSalesReport,
} from "./sales-report-api";

export const salesKey = ["sales"] as const;

export const salesKeys = {
  report: (query: ReportQuery) =>
    [...salesKey, "report", query.from ?? "", query.to ?? "", query.register_id ?? ""] as const,
  productsAndCategories: (query: SalesByProductAndCategoryQuery) =>
    [
      ...salesKey,
      "products-and-categories",
      query.group,
      query.from ?? "",
      query.to ?? "",
      query.register_id ?? "",
    ] as const,
  cashiers: (query: ReportQuery) =>
    [...salesKey, "cashiers", query.from ?? "", query.to ?? "", query.register_id ?? ""] as const,
  handTypedWeights: (query: ReportQuery) =>
    [
      ...salesKey,
      "hand-typed-weights",
      query.from ?? "",
      query.to ?? "",
      query.register_id ?? "",
    ] as const,
  promotions: (query: ReportQuery) =>
    [...salesKey, "promotions", query.from ?? "", query.to ?? "", query.register_id ?? ""] as const,
  manualDiscounts: (query: ManualDiscountsQuery) =>
    [
      ...salesKey,
      "manual-discounts",
      query.from ?? "",
      query.to ?? "",
      query.register_id ?? "",
      query.authorized_by ?? "",
    ] as const,
  cashRounding: (query: ReportQuery) =>
    [
      ...salesKey,
      "cash-rounding",
      query.from ?? "",
      query.to ?? "",
      query.register_id ?? "",
    ] as const,
  averageTicket: (query: ReportQuery) =>
    [
      ...salesKey,
      "average-ticket",
      query.from ?? "",
      query.to ?? "",
      query.register_id ?? "",
    ] as const,
};

type ReadParams = { onSessionEnded: () => void };

export function useSalesReportQuery(
  params: ReadParams & { query: ReportQuery; fetchSalesReport: typeof fetchSalesReport },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<SalesReportBody>({
    queryKey: salesKeys.report(params.query),
    keepPreviousData: true,
    read: () => params.fetchSalesReport(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useSalesByProductAndCategoryQuery(
  params: ReadParams & {
    query: SalesByProductAndCategoryQuery;
    fetchSalesByProductAndCategory: typeof fetchSalesByProductAndCategory;
  },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<SalesByProductAndCategoryBody>({
    queryKey: salesKeys.productsAndCategories(params.query),
    keepPreviousData: true,
    read: () => params.fetchSalesByProductAndCategory(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useSalesByCashierQuery(
  params: ReadParams & { query: ReportQuery; fetchSalesByCashier: typeof fetchSalesByCashier },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<SalesByCashierBody>({
    queryKey: salesKeys.cashiers(params.query),
    keepPreviousData: true,
    read: () => params.fetchSalesByCashier(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useHandTypedWeightsQuery(
  params: ReadParams & { query: ReportQuery; fetchHandTypedWeights: typeof fetchHandTypedWeights },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<HandTypedWeightsBody>({
    queryKey: salesKeys.handTypedWeights(params.query),
    keepPreviousData: true,
    read: () => params.fetchHandTypedWeights(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useSalesByPromotionQuery(
  params: ReadParams & { query: ReportQuery; fetchSalesByPromotion: typeof fetchSalesByPromotion },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<SalesByPromotionBody>({
    queryKey: salesKeys.promotions(params.query),
    keepPreviousData: true,
    read: () => params.fetchSalesByPromotion(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useManualDiscountsQuery(
  params: ReadParams & {
    query: ManualDiscountsQuery;
    fetchManualDiscounts: typeof fetchManualDiscounts;
  },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<ManualDiscountsBody>({
    queryKey: salesKeys.manualDiscounts(params.query),
    keepPreviousData: true,
    read: () => params.fetchManualDiscounts(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useAverageTicketQuery(
  params: ReadParams & { query: ReportQuery; fetchAverageTicket: typeof fetchAverageTicket },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<AverageTicketBody>({
    queryKey: salesKeys.averageTicket(params.query),
    keepPreviousData: true,
    read: () => params.fetchAverageTicket(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useCashRoundingQuery(
  params: ReadParams & { query: ReportQuery; fetchCashRounding: typeof fetchCashRounding },
) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<CashRoundingBody>({
    queryKey: salesKeys.cashRounding(params.query),
    keepPreviousData: true,
    read: () => params.fetchCashRounding(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}
