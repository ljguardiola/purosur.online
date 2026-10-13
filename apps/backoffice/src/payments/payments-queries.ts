import type {
  PendingRefundsBody,
  ReportQuery,
  ReportRegisterListBody,
  SalesByPaymentMethodBody,
} from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { fetchReportRegisters } from "../shell/report-registers-api";
import type { fetchSalesByPaymentMethod } from "./payments-report-api";
import type { fetchPendingRefunds } from "./refunds-api";

export const paymentsKey = ["payments"] as const;

export const paymentsKeys = {
  pendingRefunds: [...paymentsKey, "pending-refunds"] as const,
  reportRegisters: [...paymentsKey, "report-registers"] as const,
  salesByPaymentMethod: (query: ReportQuery) =>
    [
      ...paymentsKey,
      "sales-by-payment-method",
      query.from ?? "",
      query.to ?? "",
      query.register_id ?? "",
    ] as const,
};

export function usePendingRefundsQuery(params: {
  onSessionEnded: () => void;
  fetchPendingRefunds: typeof fetchPendingRefunds;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<PendingRefundsBody>({
    queryKey: paymentsKeys.pendingRefunds,
    read: params.fetchPendingRefunds,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useSalesByPaymentMethodQuery(params: {
  query: ReportQuery;
  fetchSalesByPaymentMethod: typeof fetchSalesByPaymentMethod;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<SalesByPaymentMethodBody>({
    queryKey: paymentsKeys.salesByPaymentMethod(params.query),
    keepPreviousData: true,
    read: () => params.fetchSalesByPaymentMethod(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useReportRegistersQuery(params: {
  fetchReportRegisters: typeof fetchReportRegisters;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<ReportRegisterListBody>({
    queryKey: paymentsKeys.reportRegisters,
    read: params.fetchReportRegisters,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRefreshPayments(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: paymentsKey });
}
