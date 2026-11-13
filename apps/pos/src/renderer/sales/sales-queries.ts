import type {
  AbandonMercadoPagoChargeOutcome,
  AnswerReceiptQuestionOutcome,
  CashChargeAmountsAnswer,
  CashChargeAnswer,
  ConsultProductOutcome,
  ContingencyBackupTicketOfSaleAnswer,
  ContingencyBackupTicketsAnswer,
  CurrentSaleAnswer,
  FindProductByCodeOutcome,
  FollowMercadoPagoChargeOutcome,
  ManualAdjustmentRequest,
  NonCashChargeAnswer,
  OpenSale,
  PaymentMethodAvailability,
  PreviewSaleDiscountOutcome,
  PreviewSaleLineAdjustmentOutcome,
  ProductToConsult,
  ReadContingencyBackupTicketOfSaleOutcome,
  ReadContingencyBackupTicketsOutcome,
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
  cashCharge: (
    saleId: string,
    pending: number,
    tendered: number | undefined,
    saleDiscount?: number,
  ) =>
    [...salesKey, "cash-charge", saleId, pending, tendered ?? null, saleDiscount ?? null] as const,
  cashChargeAmounts: (saleId: string, pending: number, saleDiscount?: number) =>
    [...salesKey, "cash-charge-amounts", saleId, pending, saleDiscount ?? null] as const,
  nonCashCharge: (saleId: string, pending: number, amount: number | undefined) =>
    [...salesKey, "non-cash-charge", saleId, pending, amount ?? null] as const,
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
  consultation: (product: ProductToConsult | undefined) =>
    [...salesKey, "consultation", product ?? null] as const,
  productByCode: (code: string) => [...salesKey, "product-by-code", code] as const,
  paymentMethodAvailabilityRoot: [...salesKey, "payment-method-availability"] as const,
  paymentMethodAvailability: (sessionId: string, userId: string) =>
    [...salesKey, "payment-method-availability", sessionId, userId] as const,
  qrCharge: (paymentTransactionId: string) =>
    [...salesKey, "qr-charge", paymentTransactionId] as const,
  receiptPrintStatus: (saleId: string) => [...salesKey, "receipt-print-status", saleId] as const,
  backupTicket: (saleId: string) => [...salesKey, "backup-ticket", saleId] as const,
  backupPrinterFailure: [...salesKey, "backup-printer-failure"] as const,
  historyRoot: [...salesKey, "history"] as const,
  history: ({ session, page, document }: SalesHistoryQuery) =>
    [
      ...salesKey,
      "history",
      session,
      page,
      document?.pointOfSale ?? null,
      document?.number ?? null,
    ] as const,
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
      status?.standing === "declined" ||
      status?.standing === "printer_not_configured"
        ? false
        : RECEIPT_PRINT_POLL_MILLISECONDS,
  });
}

export function useAnswerReceiptQuestionMutation({
  saleId,
  answer,
}: {
  saleId: string;
  answer: (saleId: string, print: boolean) => Promise<AnswerReceiptQuestionOutcome>;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (print: boolean) => answer(saleId, print),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: salesKeys.receiptPrintStatus(saleId) }),
  });
}

const BACKUP_TICKET_POLL_MILLISECONDS = 1000;
const BACKUP_PRINTER_FAILURE_POLL_MILLISECONDS = 5000;

export function useBackupTicketOfSaleQuery({
  saleId,
  read,
}: {
  saleId: string;
  read: (saleId: string) => Promise<ReadContingencyBackupTicketOfSaleOutcome>;
}): CoreData<ContingencyBackupTicketOfSaleAnswer> {
  return useCoreQuery({
    queryKey: salesKeys.backupTicket(saleId),
    read: async () => {
      const outcome = await read(saleId);
      return outcome.kind === "read" ? outcome.ticket : "unavailable";
    },
    refetchInterval: (answer) =>
      answer === undefined ||
      answer.standing === "to_print" ||
      answer.standing === "awaiting_customer_document"
        ? BACKUP_TICKET_POLL_MILLISECONDS
        : false,
  });
}

export function useBackupPrinterFailureQuery({
  read,
  enabled,
}: {
  read: () => Promise<ReadContingencyBackupTicketsOutcome>;
  enabled: boolean;
}): CoreData<ContingencyBackupTicketsAnswer["printer"]> {
  return useCoreQuery({
    queryKey: salesKeys.backupPrinterFailure,
    read: async () => {
      const outcome = await read();
      return outcome.kind === "read" ? outcome.tickets.printer : "unavailable";
    },
    enabled,
    refetchInterval: () => BACKUP_PRINTER_FAILURE_POLL_MILLISECONDS,
  });
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
  saleId: string | undefined;
  read: (saleId: string) => Promise<SaleHistoryDetailOutcome>;
}): CoreData<ShownSaleHistoryDetail> {
  return useCoreQuery({
    queryKey: salesKeys.saleDetail(saleId ?? ""),
    enabled: saleId !== undefined,
    read: async () => {
      if (saleId === undefined) {
        return "unavailable";
      }
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
  saleDiscount,
  read,
}: {
  saleId: string;
  pending: number;
  tendered: number | undefined;
  saleDiscount?: number | undefined;
  read: (tendered: number, saleDiscount?: number) => Promise<CashChargeAnswer>;
}): CoreData<CashChargeAnswer> {
  return useCoreQuery({
    queryKey: salesKeys.cashCharge(saleId, pending, tendered, saleDiscount),
    read: async () =>
      tendered === undefined
        ? "unavailable"
        : saleDiscount === undefined
          ? read(tendered)
          : read(tendered, saleDiscount),
    enabled: tendered !== undefined,
  });
}

export function useNonCashChargeQuery({
  saleId,
  pending,
  amount,
  read,
}: {
  saleId: string;
  pending: number;
  amount: number | undefined;
  read: (amount: number) => Promise<NonCashChargeAnswer>;
}): CoreData<NonCashChargeAnswer> {
  return useCoreQuery({
    queryKey: salesKeys.nonCashCharge(saleId, pending, amount),
    read: async () => (amount === undefined ? "unavailable" : read(amount)),
    enabled: amount !== undefined,
  });
}

export function useCashChargeAmountsQuery({
  saleId,
  pending,
  saleDiscount,
  read,
}: {
  saleId: string;
  pending: number;
  saleDiscount?: number | undefined;
  read: (saleDiscount?: number) => Promise<CashChargeAmountsAnswer | null>;
}): CoreData<CashChargeAmountsAnswer | null> {
  return useCoreQuery({
    queryKey: salesKeys.cashChargeAmounts(saleId, pending, saleDiscount),
    read: async () => {
      if (saleDiscount === undefined) {
        return read();
      }
      return (await read(saleDiscount)) ?? "unavailable";
    },
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

type ProductByCode = Exclude<FindProductByCodeOutcome, { kind: "unavailable" }>;

async function readProductByCode(
  read: (code: string) => Promise<FindProductByCodeOutcome>,
  code: string,
): Promise<ProductByCode | "unavailable"> {
  const outcome = await read(code);
  return outcome.kind === "unavailable" ? "unavailable" : outcome;
}

export function useProductByCodeQuery({
  code,
  read,
}: {
  code: string | undefined;
  read: (code: string) => Promise<FindProductByCodeOutcome>;
}): CoreData<ProductByCode> {
  return useCoreQuery({
    queryKey: salesKeys.productByCode(code ?? ""),
    read: () => readProductByCode(read, code ?? ""),
    enabled: code !== undefined,
  });
}

export function useFindProductByCode(
  read: (code: string) => Promise<FindProductByCodeOutcome>,
): (code: string) => Promise<FindProductByCodeOutcome> {
  const queryClient = useQueryClient();
  return (code) =>
    queryClient
      .fetchQuery({
        ...coreQueryOptions({
          queryKey: salesKeys.productByCode(code),
          read: () => readProductByCode(read, code),
        }),
        gcTime: 0,
      })
      .catch((): FindProductByCodeOutcome => ({ kind: "unavailable" }));
}

const CONSULTATION_PAUSE_MS = 250;

export function useConsultedProductQuery(
  read: (product: ProductToConsult) => Promise<ConsultProductOutcome>,
  product: ProductToConsult | undefined,
): CoreData<ConsultProductOutcome> {
  return useCoreQuery({
    queryKey: salesKeys.consultation(product),
    read: () => (product === undefined ? Promise.resolve("unavailable" as const) : read(product)),
    enabled: product !== undefined,
    gcTime: 0,
    refetchInterval: (answer) =>
      answer?.kind === "consulted" && answer.sale_unit === "KG" ? CONSULTATION_PAUSE_MS : false,
  });
}
