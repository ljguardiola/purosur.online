import type {
  AverageTicketBody,
  ReportQuery,
  SalesByCashierBody,
  SalesByProductAndCategoryBody,
  SalesByProductAndCategoryQuery,
  SalesByPromotionBody,
  SalesReportBody,
} from "@purosur/contracts";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type {
  fetchAverageTicket,
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
  promotions: (query: ReportQuery) =>
    [...salesKey, "promotions", query.from ?? "", query.to ?? "", query.register_id ?? ""] as const,
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
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<SalesReportBody>({
    queryKey: salesKeys.report(params.query),
    keepPreviousData: true,
    read: () => params.fetchSalesReport(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useSalesByProductAndCategoryQuery(
  params: ReadParams & {
    query: SalesByProductAndCategoryQuery;
    fetchSalesByProductAndCategory: typeof fetchSalesByProductAndCategory;
  },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<SalesByProductAndCategoryBody>({
    queryKey: salesKeys.productsAndCategories(params.query),
    keepPreviousData: true,
    read: () => params.fetchSalesByProductAndCategory(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useSalesByCashierQuery(
  params: ReadParams & { query: ReportQuery; fetchSalesByCashier: typeof fetchSalesByCashier },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<SalesByCashierBody>({
    queryKey: salesKeys.cashiers(params.query),
    keepPreviousData: true,
    read: () => params.fetchSalesByCashier(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useSalesByPromotionQuery(
  params: ReadParams & { query: ReportQuery; fetchSalesByPromotion: typeof fetchSalesByPromotion },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<SalesByPromotionBody>({
    queryKey: salesKeys.promotions(params.query),
    keepPreviousData: true,
    read: () => params.fetchSalesByPromotion(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useAverageTicketQuery(
  params: ReadParams & { query: ReportQuery; fetchAverageTicket: typeof fetchAverageTicket },
) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<AverageTicketBody>({
    queryKey: salesKeys.averageTicket(params.query),
    keepPreviousData: true,
    read: () => params.fetchAverageTicket(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}
