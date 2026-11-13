import type {
  HandConfirmedPaymentsBody,
  HandConfirmedPaymentsQuery,
  MercadoPagoChargeCostsBody,
  MercadoPagoChargeCostsQuery,
  PendingRefundsBody,
  ReportQuery,
  SalesByPaymentMethodBody,
} from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { mapCloudData } from "../platform/map-cloud-data";
import { useSendToOwnAccount } from "../platform/send-to-own-account";
import { type CloudData, useCloudQuery } from "../platform/use-cloud-query";
import type { fetchMercadoPagoChargeCosts } from "./mercado-pago-charge-costs-api";
import type { fetchHandConfirmedPayments, fetchSalesByPaymentMethod } from "./payments-report-api";
import { madeOutsideTheSystem, sentToMercadoPago } from "./refund-kinds";
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
  mercadoPagoChargeCosts: (query: MercadoPagoChargeCostsQuery) =>
    [...paymentsKey, "mercado-pago-charge-costs", query.from ?? "", query.to ?? ""] as const,
  handConfirmedPayments: (query: HandConfirmedPaymentsQuery) =>
    [
      ...paymentsKey,
      "hand-confirmed-payments",
      query.from ?? "",
      query.to ?? "",
      query.register_id ?? "",
      query.method ?? "",
    ] as const,
};

export function usePendingRefundsQuery(params: {
  onSessionEnded: () => void;
  fetchPendingRefunds: typeof fetchPendingRefunds;
}) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<PendingRefundsBody>({
    queryKey: paymentsKeys.pendingRefunds,
    read: params.fetchPendingRefunds,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export type PendingRefundCounts = { mercadoPago: number; outsideTheSystem: number };

export function usePendingRefundCounts(params: {
  enabled: boolean;
  fetchPendingRefunds: typeof fetchPendingRefunds;
  onSessionEnded: () => void;
}): CloudData<PendingRefundCounts> {
  return mapCloudData(
    useCloudQuery<PendingRefundsBody>({
      queryKey: paymentsKeys.pendingRefunds,
      enabled: params.enabled,
      read: params.fetchPendingRefunds,
      onSessionEnded: params.onSessionEnded,
    }),
    ({ refunds }) => ({
      mercadoPago: sentToMercadoPago(refunds).length,
      outsideTheSystem: madeOutsideTheSystem(refunds).length,
    }),
  );
}

export function useSalesByPaymentMethodQuery(params: {
  query: ReportQuery;
  fetchSalesByPaymentMethod: typeof fetchSalesByPaymentMethod;
  onSessionEnded: () => void;
}) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<SalesByPaymentMethodBody>({
    queryKey: paymentsKeys.salesByPaymentMethod(params.query),
    keepPreviousData: true,
    read: () => params.fetchSalesByPaymentMethod(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useHandConfirmedPaymentsQuery(params: {
  query: HandConfirmedPaymentsQuery;
  fetchHandConfirmedPayments: typeof fetchHandConfirmedPayments;
  onSessionEnded: () => void;
}) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<HandConfirmedPaymentsBody>({
    queryKey: paymentsKeys.handConfirmedPayments(params.query),
    keepPreviousData: true,
    read: () => params.fetchHandConfirmedPayments(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useMercadoPagoChargeCostsQuery(params: {
  query: MercadoPagoChargeCostsQuery;
  fetchMercadoPagoChargeCosts: typeof fetchMercadoPagoChargeCosts;
  onSessionEnded: () => void;
}) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<MercadoPagoChargeCostsBody>({
    queryKey: paymentsKeys.mercadoPagoChargeCosts(params.query),
    keepPreviousData: true,
    read: () => params.fetchMercadoPagoChargeCosts(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useRefreshPayments(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: paymentsKey });
}
