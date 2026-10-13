import type { PendingRefundsBody, ReportQuery, SalesByPaymentMethodBody } from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { fetchSalesByPaymentMethod } from "./payments-report-api";
import type { fetchPendingRefunds } from "./refunds-api";

export const paymentsKey = ["payments"] as const;

export const paymentsKeys = {
  pendingRefunds: [...paymentsKey, "pending-refunds"] as const,
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

export function useRefreshPayments(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: paymentsKey });
}
