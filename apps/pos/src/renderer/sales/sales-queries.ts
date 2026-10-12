import type {
  AbandonMercadoPagoChargeOutcome,
  CashChargeAnswer,
  CurrentSaleAnswer,
  FollowMercadoPagoChargeOutcome,
  ManualAdjustmentRequest,
  OpenSale,
  PaymentMethodAvailability,
  PreviewSaleDiscountOutcome,
  PreviewSaleLineAdjustmentOutcome,
  ReceiptPrintStatusOutcome,
  SaleDiscountRequest,
  SaleHistoryDetailOutcome,
  SalesHistoryOutcome,
  SearchProductsOutcome,
} from "@purosur/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SalesHistoryQuery } from "../platform/core-client";
import { setQueryAnswer } from "../platform/set-query-answer";
import type { CoreData } from "../platform/use-core-query";
import { coreQueryOptions, useCoreQuery } from "../platform/use-core-query";

const salesKey = ["sales"] as const;

export const salesKeys = {
  currentSaleRoot: [...salesKey, "current-sale"] as const,
  currentSale: (sessionId: string, userId: string) =>
    [...salesKey, "current-sale", sessionId, userId] as const,
  cashCharge: (saleId: string, pending: number, tendered: number | undefined) =>
    [...salesKey, "cash-charge", saleId, pending, tendered ?? null] as const,
  adjustmentPreview: (lineId: string, quantity: number, adjustment: ManualAdjustmentRequest) =>
    [
      ...salesKey,
      "adjustment-preview",
      lineId,
      quantity,
      adjustment.kind,
      adjustment.value,
    ] as const,
  saleDiscountPreview: (subtotal: number, discount: SaleDiscountRequest) =>
    [...salesKey, "sale-discount-preview", subtotal, discount.kind, discount.value] as const,
  search: (query: string) => [...salesKey, "search", query] as const,
  paymentMethodAvailabilityRoot: [...salesKey, "payment-method-availability"] as const,
  paymentMethodAvailability: (sessionId: string, userId: string) =>
    [...salesKey, "payment-method-availability", sessionId, userId] as const,
  qrCharge: (paymentTransactionId: string) =>
    [...salesKey, "qr-charge", paymentTransactionId] as const,
  receiptPrintStatus: (saleId: string) => [...salesKey, "receipt-print-status", saleId] as const,
  historyRoot: [...salesKey, "history"] as const,
  history: ({ session, state, page }: SalesHistoryQuery) =>
    [...salesKey, "history", session, state, page] as const,
  saleDetail: (saleId: string) => [...salesKey, "history-detail", saleId] as const,
};

const QR_WAIT_FOLLOW_INTERVAL_MS = 1000;

export type FollowedQrCharge = Exclude<FollowMercadoPagoChargeOutcome, { kind: "unavailable" }>;

export function useQrChargeQuery({
  paymentTransactionId,
  follow,
  following = true,
}: {
  paymentTransactionId: string;
  follow: (paymentTransactionId: string) => Promise<FollowMercadoPagoChargeOutcome>;
  following?: boolean;
}): CoreData<FollowedQrCharge> {
  const queryClient = useQueryClient();
  const queryKey = salesKeys.qrCharge(paymentTransactionId);
  const query = useQuery({
    ...coreQueryOptions<FollowedQrCharge>({
      queryKey,
      read: async () => {
        const outcome = await follow(paymentTransactionId);
        return outcome.kind === "unavailable" ? "unavailable" : outcome;
      },
    }),
    gcTime: 0,
    enabled: following,
    refetchInterval: ({ state }) =>
      following &&
      state.status === "success" &&
      (state.data?.kind === "waiting" ||
        state.data?.kind === "expiry_unconfirmed" ||
        state.data?.kind === "at_terminal_wait_over")
        ? QR_WAIT_FOLLOW_INTERVAL_MS
        : false,
    refetchIntervalInBackground: true,
  });
  if (query.isError && !query.isFetching) {
    return { status: "failed", retry: () => void queryClient.resetQueries({ queryKey }) };
  }
  if (query.data !== undefined) {
    return { status: "loaded", value: query.data, refreshing: query.isFetching };
  }
  return { status: "loading" };
}

export function useAbandonQrChargeMutation(
  abandon: (paymentTransactionId: string) => Promise<AbandonMercadoPagoChargeOutcome>,
) {
  return useMutation({
    mutationFn: (paymentTransactionId: string) => abandon(paymentTransactionId),
  });
}

export function usePaymentMethodAvailabilityQuery({
  sessionId,
  userId,
  read,
}: {
  sessionId: string;
  userId: string;
  read: () => Promise<PaymentMethodAvailability | null>;
}): CoreData<PaymentMethodAvailability> {
  return useCoreQuery({
    queryKey: salesKeys.paymentMethodAvailability(sessionId, userId),
    read: async () => (await read()) ?? "unavailable",
    staleTime: 0,
  });
}

export function useRefreshPaymentMethodAvailability(
  sessionId: string,
  userId: string,
): () => Promise<void> {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: salesKeys.paymentMethodAvailability(sessionId, userId),
    });
}

const RECEIPT_PRINT_POLL_MILLISECONDS = 1000;

export type ReceiptPrintStatus = Extract<ReceiptPrintStatusOutcome, { kind: "found" }>;

export function useReceiptPrintStatusQuery({
  saleId,
  read,
}: {
  saleId: string;
  read: (saleId: string) => Promise<ReceiptPrintStatusOutcome>;
}): CoreData<ReceiptPrintStatus> {
  return useCoreQuery({
    queryKey: salesKeys.receiptPrintStatus(saleId),
    read: async () => {
      const outcome = await read(saleId);
      return outcome.kind === "found" ? outcome : "unavailable";
    },
    refetchInterval: (status) =>
      status?.printed === true ||
      status?.standing === "failed" ||
      status?.standing === "printer_not_configured"
        ? false
        : RECEIPT_PRINT_POLL_MILLISECONDS,
  });
}

export function useRefreshReceiptPrintStatus(saleId: string): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: salesKeys.receiptPrintStatus(saleId) });
}

export type ShownSalesHistory = Exclude<SalesHistoryOutcome, { kind: "unavailable" }>;

export function useSalesHistoryQuery({
  read,
  ...query
}: SalesHistoryQuery & {
  read: (query: SalesHistoryQuery) => Promise<SalesHistoryOutcome>;
}): CoreData<ShownSalesHistory> {
  return useCoreQuery({
    queryKey: salesKeys.history(query),
    read: async () => {
      const outcome = await read(query);
      return outcome.kind === "unavailable" ? "unavailable" : outcome;
    },
  });
}

export function useRefreshSalesHistory(): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: salesKeys.historyRoot }),
      queryClient.invalidateQueries({ queryKey: [...salesKey, "history-detail"] }),
    ]);
  };
}

export type ShownSaleHistoryDetail = Exclude<SaleHistoryDetailOutcome, { kind: "unavailable" }>;

export function useSaleHistoryDetailQuery({
  saleId,
  read,
}: {
  saleId: string;
  read: (saleId: string) => Promise<SaleHistoryDetailOutcome>;
}): CoreData<ShownSaleHistoryDetail> {
  return useCoreQuery({
    queryKey: salesKeys.saleDetail(saleId),
    read: async () => {
      const outcome = await read(saleId);
      return outcome.kind === "unavailable" ? "unavailable" : outcome;
    },
  });
}

export function useCurrentSaleQuery({
  sessionId,
  userId,
  read,
}: {
  sessionId: string;
  userId: string;
  read: () => Promise<CurrentSaleAnswer>;
}): CoreData<CurrentSaleAnswer> {
  return useCoreQuery({
    queryKey: salesKeys.currentSale(sessionId, userId),
    read,
    refetchInterval: (answer) =>
      answer !== undefined &&
      answer !== null &&
      answer !== "not_permitted" &&
      (answer.lines_lock === "mercado_pago_charge_in_progress" ||
        answer.cancel_refusal === "mercado_pago_charge_in_progress")
        ? QR_WAIT_FOLLOW_INTERVAL_MS
        : false,
  });
}

export function useReadCurrentSale(
  sessionId: string,
  userId: string,
  read: () => Promise<CurrentSaleAnswer>,
): () => Promise<CurrentSaleAnswer | "unavailable"> {
  const queryClient = useQueryClient();
  return () =>
    queryClient
      .fetchQuery({
        ...coreQueryOptions({ queryKey: salesKeys.currentSale(sessionId, userId), read }),
        staleTime: 0,
      })
      .catch((): "unavailable" => "unavailable");
}

export function useCashChargeQuery({
  saleId,
  pending,
  tendered,
  read,
}: {
  saleId: string;
  pending: number;
  tendered: number | undefined;
  read: (tendered: number) => Promise<CashChargeAnswer>;
}): CoreData<CashChargeAnswer> {
  return useCoreQuery({
    queryKey: salesKeys.cashCharge(saleId, pending, tendered),
    read: async () => (tendered === undefined ? "unavailable" : read(tendered)),
    enabled: tendered !== undefined,
  });
}

export type ShownAdjustmentPreview = Exclude<
  PreviewSaleLineAdjustmentOutcome,
  { kind: "unavailable" }
>;

export function useAdjustmentPreviewQuery({
  lineId,
  quantity,
  adjustment,
  read,
}: {
  lineId: string;
  quantity: number;
  adjustment: ManualAdjustmentRequest | undefined;
  read: (
    lineId: string,
    adjustment: ManualAdjustmentRequest,
  ) => Promise<PreviewSaleLineAdjustmentOutcome>;
}): CoreData<ShownAdjustmentPreview> {
  return useCoreQuery({
    queryKey: salesKeys.adjustmentPreview(
      lineId,
      quantity,
      adjustment ?? { kind: "PERCENT", value: 0 },
    ),
    read: async () => {
      const outcome = adjustment === undefined ? undefined : await read(lineId, adjustment);
      return outcome === undefined || outcome.kind === "unavailable" ? "unavailable" : outcome;
    },
    enabled: adjustment !== undefined,
    staleTime: 0,
  });
}

export type ShownSaleDiscountPreview = Exclude<PreviewSaleDiscountOutcome, { kind: "unavailable" }>;

export function useSaleDiscountPreviewQuery({
  subtotal,
  discount,
  read,
}: {
  subtotal: number;
  discount: SaleDiscountRequest | undefined;
  read: (discount: SaleDiscountRequest) => Promise<PreviewSaleDiscountOutcome>;
}): CoreData<ShownSaleDiscountPreview> {
  return useCoreQuery({
    queryKey: salesKeys.saleDiscountPreview(subtotal, discount ?? { kind: "PERCENT", value: 0 }),
    read: async () => {
      const outcome = discount === undefined ? undefined : await read(discount);
      return outcome === undefined || outcome.kind === "unavailable" ? "unavailable" : outcome;
    },
    enabled: discount !== undefined,
    staleTime: 0,
  });
}

export function useTakeSale(
  sessionId: string,
  userId: string,
): (sale: OpenSale | null) => Promise<OpenSale | null> {
  const queryClient = useQueryClient();
  return async (sale) => {
    const queryKey = salesKeys.currentSale(sessionId, userId);
    const previous = queryClient.getQueryData<CurrentSaleAnswer>(queryKey);
    await setQueryAnswer(queryClient, queryKey, sale);
    return previous === undefined || previous === "not_permitted" ? null : previous;
  };
}

export function useRefreshCurrentSale(sessionId: string, userId: string): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => {
    const queryKey = salesKeys.currentSale(sessionId, userId);
    return queryClient
      .invalidateQueries({ queryKey }, { throwOnError: true })
      .catch(() => queryClient.resetQueries({ queryKey }));
  };
}

export function useResetCurrentSale(sessionId: string, userId: string): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => queryClient.resetQueries({ queryKey: salesKeys.currentSale(sessionId, userId) });
}

export function useSearchProducts(
  read: (query: string) => Promise<SearchProductsOutcome>,
): (query: string) => Promise<SearchProductsOutcome> {
  const queryClient = useQueryClient();
  return (query) =>
    queryClient
      .fetchQuery({ queryKey: salesKeys.search(query), queryFn: () => read(query), gcTime: 0 })
      .catch((): SearchProductsOutcome => ({ kind: "unavailable" }));
}
