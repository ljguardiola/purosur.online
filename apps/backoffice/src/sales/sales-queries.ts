import type {
  ReportQuery,
  SalesByCashierBody,
  SalesByProductAndCategoryBody,
  SalesByProductAndCategoryQuery,
  SalesReportBody,
} from "@purosur/contracts";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type {
  fetchSalesByCashier,
  fetchSalesByProductAndCategory,
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
