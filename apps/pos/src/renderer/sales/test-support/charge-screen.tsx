import type {
  AbandonMercadoPagoChargeOutcome,
  AnswerReceiptQuestionOutcome,
  Authorization,
  CashChargeAmountsAnswer,
  CashChargeAnswer,
  ChargeSaleByTransferOutcome,
  ChargeSaleInCashOutcome,
  ChargeSaleInCashWithChangeDiscountOutcome,
  ChargeSaleOnStandaloneTerminalOutcome,
  ChargeSaleWithPaidOrderOutcome,
  CurrentSaleAnswer,
  FollowMercadoPagoChargeOutcome,
  NonCashChargeAnswer,
  OpenSale,
  PaymentMethodAvailability,
  ReadContingencyBackupTicketOfSaleOutcome,
  ReadContingencyBackupTicketsOutcome,
  ReceiptPrintStatusOutcome,
  SignInUser,
  StartMercadoPagoChargeOutcome,
} from "@purosur/contracts";
import type { ReactNode } from "react";
import { Fragment, useEffect, useState } from "react";
import { onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { MercadoPagoChargeKind } from "../../platform/core-client";
import { render } from "../../shell/test-support/render-with-router";
import type { ChargeMethod } from "../charge-method-availability";
import type { ChargeScreenProps } from "../charge-screen";
import { ChargeScreen } from "../charge-screen";

export const PERSON: ChargeScreenProps["person"] = {
  user_id: "u1",
  first_name: "Ada",
  abilities: ["open_cash_session"],
};
const YERBA = {
  id: "line-1",
  product_id: "p1",
  product_name: "Yerba mate 1 kg",
  sale_unit: "UNIT" as const,
  weight_source: null,
  quantity: 2,
  list_unit_price: 238_000,
  discount_amount: 0,
  promotion: null,
  manual_adjustment: null,
  line_total: 476_000,
};
const ALFAJOR = {
  id: "line-2",
  product_id: "p2",
  product_name: "Alfajor triple",
  sale_unit: "UNIT" as const,
  weight_source: null,
  quantity: 1,
  list_unit_price: 150_000,
  discount_amount: 0,
  promotion: null,
  manual_adjustment: null,
  line_total: 150_000,
};
export const SALE_OF_ONE_LINE: OpenSale = {
  id: "sale-1",
  lines: [YERBA],
  total: 476_000,
  paid: 0,
  pending: 476_000,
  lines_lock: null,
  cancel_refusal: null,
  charge_refusal: null,
  rebuilt_paid_order: null,
  mercado_pago_charge_in_progress: null,
  refunds_on_cancel: [],
  cancel_authorization_required: false,
  adjust_authorization_required: false,
  sale_discount_authorization_required: false,
  sale_discount_refusal: null,
  sale_discount: null,
  gross_subtotal: 476_000,
  subtotal: 476_000,
  promotion_savings: 0,
};
export const SALE_OF_TWO_LINES: OpenSale = {
  id: "sale-1",
  lines: [YERBA, ALFAJOR],
  total: 626_000,
  paid: 0,
  pending: 626_000,
  lines_lock: null,
  cancel_refusal: null,
  charge_refusal: null,
  rebuilt_paid_order: null,
  mercado_pago_charge_in_progress: null,
  refunds_on_cancel: [],
  cancel_authorization_required: false,
  adjust_authorization_required: false,
  sale_discount_authorization_required: false,
  sale_discount_refusal: null,
  sale_discount: null,
  gross_subtotal: 626_000,
  subtotal: 626_000,
  promotion_savings: 0,
};
const COMPLETED: ChargeSaleInCashOutcome = {
  kind: "completed",
  sale_id: "sale-1",
  total: 476_000,
  tendered: 500_000,
  change: 24_000,
  cash_rounding: 0,
};

const TRANSFER_COMPLETED: ChargeSaleByTransferOutcome = {
  kind: "completed",
  sale_id: "sale-1",
  total: 476_000,
};

const STANDALONE_TERMINAL_COMPLETED: ChargeSaleOnStandaloneTerminalOutcome = {
  kind: "completed",
  sale_id: "sale-1",
  total: 476_000,
};

export const SALE_WITH_PART_PAID: OpenSale = {
  ...SALE_OF_ONE_LINE,
  paid: 100_000,
  pending: 376_000,
  lines_lock: "approved_payment",
  cancel_refusal: null,
};

const COVERED: CashChargeAnswer = {
  kind: "covered",
  applied: 476_000,
  change: 24_000,
  cash_rounding: 0,
};

const AMOUNTS_OF_SALE = (discount?: number): CashChargeAmountsAnswer => ({
  kind: "amounts",
  amount_due: 476_000 - (discount ?? 0),
  amount_to_charge: 476_000 - (discount ?? 0),
  cash_rounding: 0,
  quick_amounts: [476_000, 500_000, 1_000_000, 2_000_000],
  change_discount_option: null,
});

export const QR_PAYMENT_ID = "019a0000-0000-7000-8000-0000000000a1";
export const QR_ORDER_SHOWN: StartMercadoPagoChargeOutcome = {
  kind: "order_shown",
  payment_transaction_id: QR_PAYMENT_ID,
  amount: 476_000,
  remaining_seconds: 180,
  wait_seconds: 180,
};
const QR_WAITING: FollowMercadoPagoChargeOutcome = { kind: "waiting", remaining_seconds: 170 };

export const POINT_PAYMENT_ID = "019a0000-0000-7000-8000-0000000000b1";
export const POINT_ORDER_SHOWN: StartMercadoPagoChargeOutcome = {
  kind: "order_shown",
  payment_transaction_id: POINT_PAYMENT_ID,
  amount: 476_000,
  remaining_seconds: 180,
  wait_seconds: 180,
};

export const AVAILABLE: PaymentMethodAvailability = {
  qr: "available",
  point: "available",
  point_minimum: 1500,
  qr_minimum: 1500,
};

export type Overrides = {
  method?: ChargeMethod;
  paymentMethodAvailability?: () => Promise<PaymentMethodAvailability | null>;
  startMercadoPagoCharge?: (
    saleId: string,
    charge: MercadoPagoChargeKind,
    amount: number,
  ) => Promise<StartMercadoPagoChargeOutcome>;
  followMercadoPagoCharge?: (
    paymentTransactionId: string,
  ) => Promise<FollowMercadoPagoChargeOutcome>;
  abandonMercadoPagoCharge?: (
    paymentTransactionId: string,
  ) => Promise<AbandonMercadoPagoChargeOutcome>;
  person?: ChargeScreenProps["person"];
  currentSale?: () => Promise<CurrentSaleAnswer>;
  cashCharge?: (
    saleId: string,
    tendered: number,
    saleDiscount?: number,
  ) => Promise<CashChargeAnswer>;
  cashChargeAmounts?: (
    saleId: string,
    saleDiscount?: number,
  ) => Promise<CashChargeAmountsAnswer | null>;
  chargeSaleInCash?: (saleId: string, tendered: number) => Promise<ChargeSaleInCashOutcome>;
  chargeSaleInCashWithChangeDiscount?: (
    saleId: string,
    tendered: number,
    discountAmount: number,
    authorization: Authorization | undefined,
  ) => Promise<ChargeSaleInCashWithChangeDiscountOutcome>;
  nonCashCharge?: (saleId: string, amount: number) => Promise<NonCashChargeAnswer>;
  chargeSaleByTransfer?: (saleId: string, amount: number) => Promise<ChargeSaleByTransferOutcome>;
  chargeSaleOnStandaloneTerminal?: (
    saleId: string,
    amount: number,
  ) => Promise<ChargeSaleOnStandaloneTerminalOutcome>;
  chargeSaleWithPaidOrder?: (saleId: string) => Promise<ChargeSaleWithPaidOrderOutcome>;
  receiptPrintStatus?: (saleId: string) => Promise<ReceiptPrintStatusOutcome>;
  answerReceiptQuestion?: (saleId: string, print: boolean) => Promise<AnswerReceiptQuestionOutcome>;
  contingencyBackupTicketOfSale?: (
    saleId: string,
  ) => Promise<ReadContingencyBackupTicketOfSaleOutcome>;
  contingencyBackupTickets?: () => Promise<ReadContingencyBackupTicketsOutcome>;
};

type Remount = { setMethod?: (method: ChargeMethod) => void };

function RemountableScreen({
  onMounted,
  initialMethod,
  screen,
}: {
  onMounted: (setMethod: (method: ChargeMethod) => void) => void;
  initialMethod: ChargeMethod | undefined;
  screen: (method: ChargeMethod | undefined) => ReactNode;
}) {
  const [method, setMethod] = useState(initialMethod);
  useEffect(() => {
    onMounted(setMethod);
  }, [onMounted]);
  return <Fragment key={method ?? "none"}>{screen(method)}</Fragment>;
}

const remounts = new WeakMap<object, Remount>();

const PRINTED: ReceiptPrintStatusOutcome = {
  kind: "found",
  next_copy: { kind: "original" },
  printed: true,
  standing: "printed",
  comprobante: { kind: "none" },
  offer: null,
};

export async function renderScreen(overrides: Overrides = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const currentSale = vi.fn(overrides.currentSale ?? (async () => SALE_OF_ONE_LINE));
  const cashCharge = vi.fn(overrides.cashCharge ?? (async () => COVERED));
  const cashChargeAmounts = vi.fn(
    overrides.cashChargeAmounts ?? (async (_saleId, discount) => AMOUNTS_OF_SALE(discount)),
  );
  const chargeSaleInCash = vi.fn(overrides.chargeSaleInCash ?? (async () => COMPLETED));
  const chargeSaleInCashWithChangeDiscount = vi.fn(
    overrides.chargeSaleInCashWithChangeDiscount ?? (async () => COMPLETED),
  );
  const loadAuthorizers = vi.fn(
    async (): Promise<SignInUser[]> => [{ id: "u3", first_name: "Sofía" }],
  );
  const nonCashCharge = vi.fn(
    overrides.nonCashCharge ??
      (async (): Promise<NonCashChargeAnswer> => ({ kind: "covered", applied: 476_000 })),
  );
  const chargeSaleByTransfer = vi.fn(
    overrides.chargeSaleByTransfer ?? (async () => TRANSFER_COMPLETED),
  );
  const chargeSaleOnStandaloneTerminal = vi.fn(
    overrides.chargeSaleOnStandaloneTerminal ?? (async () => STANDALONE_TERMINAL_COMPLETED),
  );
  const chargeSaleWithPaidOrder = vi.fn(
    overrides.chargeSaleWithPaidOrder ??
      (async (): Promise<ChargeSaleWithPaidOrderOutcome> => ({
        kind: "completed",
        sale_id: "sale-1",
        total: 476_000,
        applied: 476_000,
        surplus: 0,
        surplus_sent_by_cloud: true,
      })),
  );
  const paymentMethodAvailability = vi.fn(
    overrides.paymentMethodAvailability ?? (async () => AVAILABLE),
  );
  const startMercadoPagoCharge = vi.fn(
    overrides.startMercadoPagoCharge ?? (async () => QR_ORDER_SHOWN),
  );
  const followMercadoPagoCharge = vi.fn(
    overrides.followMercadoPagoCharge ?? (async () => QR_WAITING),
  );
  const abandonMercadoPagoCharge = vi.fn(
    overrides.abandonMercadoPagoCharge ??
      (async (): Promise<AbandonMercadoPagoChargeOutcome> => ({ kind: "cancelled" })),
  );
  const receiptPrintStatus = vi.fn(overrides.receiptPrintStatus ?? (async () => PRINTED));
  const answerReceiptQuestion = vi.fn(
    overrides.answerReceiptQuestion ??
      (async (): Promise<AnswerReceiptQuestionOutcome> => ({ kind: "printing" })),
  );
  const contingencyBackupTicketOfSale = vi.fn(
    overrides.contingencyBackupTicketOfSale ??
      (async (): Promise<ReadContingencyBackupTicketOfSaleOutcome> => ({
        kind: "read",
        ticket: { standing: null },
      })),
  );
  const contingencyBackupTickets = vi.fn(
    overrides.contingencyBackupTickets ??
      (async (): Promise<ReadContingencyBackupTicketsOutcome> => ({ kind: "unavailable" })),
  );
  const onSessionInvalid = vi.fn();
  const remount: Remount = {};
  const screen = await render(
    <RemountableScreen
      onMounted={(setMethod) => {
        remount.setMethod = setMethod;
      }}
      initialMethod={overrides.method}
      screen={(method) => (
        <ChargeScreen
          sessionId="s1"
          {...(method === undefined ? {} : { method })}
          person={overrides.person ?? PERSON}
          lock={() => {}}
          currentSale={currentSale}
          cashCharge={cashCharge}
          cashChargeAmounts={cashChargeAmounts}
          chargeSaleInCash={chargeSaleInCash}
          chargeSaleInCashWithChangeDiscount={chargeSaleInCashWithChangeDiscount}
          loadAuthorizers={loadAuthorizers}
          nonCashCharge={nonCashCharge}
          chargeSaleByTransfer={chargeSaleByTransfer}
          chargeSaleOnStandaloneTerminal={chargeSaleOnStandaloneTerminal}
          chargeSaleWithPaidOrder={chargeSaleWithPaidOrder}
          paymentMethodAvailability={paymentMethodAvailability}
          startMercadoPagoCharge={startMercadoPagoCharge}
          followMercadoPagoCharge={followMercadoPagoCharge}
          abandonMercadoPagoCharge={abandonMercadoPagoCharge}
          receiptPrintStatus={receiptPrintStatus}
          answerReceiptQuestion={answerReceiptQuestion}
          contingencyBackupTicketOfSale={contingencyBackupTicketOfSale}
          contingencyBackupTickets={contingencyBackupTickets}
          onSessionInvalid={onSessionInvalid}
        />
      )}
    />,
  );
  remounts.set(screen, remount);
  return {
    screen,
    currentSale,
    cashCharge,
    cashChargeAmounts,
    chargeSaleInCash,
    chargeSaleInCashWithChangeDiscount,
    nonCashCharge,
    chargeSaleByTransfer,
    chargeSaleOnStandaloneTerminal,
    chargeSaleWithPaidOrder,
    paymentMethodAvailability,
    startMercadoPagoCharge,
    followMercadoPagoCharge,
    abandonMercadoPagoCharge,
    receiptPrintStatus,
    answerReceiptQuestion,
    contingencyBackupTicketOfSale,
    contingencyBackupTickets,
    onSessionInvalid,
  };
}

export type Screen = Awaited<ReturnType<typeof renderScreen>>["screen"];

function openMethodFromTheSale(screen: Screen, method: ChargeMethod) {
  const remount = remounts.get(screen);
  if (remount?.setMethod === undefined) {
    throw new Error("the screen was not rendered by renderScreen");
  }
  remount.setMethod(method);
}

export function chooseCash(screen: Screen) {
  openMethodFromTheSale(screen, "CASH");
}

export async function chooseTransfer(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Transferencia" }));
}

export async function chooseStandaloneTerminal(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Terminal independiente" }));
}

export function chooseQr(screen: Screen) {
  openMethodFromTheSale(screen, "QR");
}

export function choosePoint(screen: Screen, cardType: "DEBIT" | "CREDIT" = "DEBIT") {
  openMethodFromTheSale(screen, cardType === "DEBIT" ? "POINT_DEBIT" : "POINT_CREDIT");
}

export async function chargeInCash(screen: Screen, tendered: string) {
  await chooseCash(screen);
  await userEvent.fill(screen.getByRole("textbox", { name: "RECIBIDO" }), tendered);
  await userEvent.click(screen.getByRole("button", { name: "Cobrar" }));
}

export function saleWithChargeInProgress(
  charge: MercadoPagoChargeKind,
  remainingSeconds: number,
): OpenSale {
  const inProgress = { amount: 476_000, remaining_seconds: remainingSeconds, wait_seconds: 180 };
  return {
    ...SALE_OF_ONE_LINE,
    lines_lock: "mercado_pago_charge_in_progress",
    cancel_refusal: "mercado_pago_charge_in_progress",
    mercado_pago_charge_in_progress:
      charge.method === "POINT"
        ? {
            ...inProgress,
            payment_transaction_id: POINT_PAYMENT_ID,
            method: "POINT",
            card_type: charge.cardType,
          }
        : { ...inProgress, payment_transaction_id: QR_PAYMENT_ID, method: "QR" },
  };
}

export function saleRebuiltAgainstPaidOrder(
  paidOrder: { method: "QR" | "POINT"; amount: number; applied?: boolean },
  sale: OpenSale = SALE_OF_ONE_LINE,
): OpenSale {
  return {
    ...sale,
    rebuilt_paid_order: {
      payment_transaction_id: QR_PAYMENT_ID,
      applied: false,
      ...paidOrder,
    },
  };
}

export function readsInTurn(
  first: CurrentSaleAnswer,
  ...rest: CurrentSaleAnswer[]
): () => Promise<CurrentSaleAnswer> {
  const reads = [first, ...rest];
  return async () => (reads.length > 1 ? reads.shift() : reads[0]) ?? null;
}

export function renderCombinedPayment(overrides: Overrides = {}) {
  return renderScreen({
    method: "CASH",
    currentSale: async () =>
      saleRebuiltAgainstPaidOrder({ method: "QR", amount: 100_000 }, SALE_WITH_PART_PAID),
    ...overrides,
  });
}

export function valueBeside(screen: Screen, label: string): string | null {
  return screen.getByText(label, { exact: true }).element().nextElementSibling?.textContent ?? null;
}
