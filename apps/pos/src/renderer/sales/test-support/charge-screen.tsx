import type {
  AbandonMercadoPagoChargeOutcome,
  CashChargeAnswer,
  ChargeSaleByTransferOutcome,
  ChargeSaleInCashOutcome,
  ChargeSaleOnStandaloneTerminalOutcome,
  CurrentSaleAnswer,
  FollowMercadoPagoChargeOutcome,
  OpenSale,
  PaymentMethodAvailability,
  ReceiptPrintStatusOutcome,
  StartMercadoPagoChargeOutcome,
} from "@purosur/contracts";
import { onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { MercadoPagoMethod } from "../../platform/core-client";
import { render } from "../../shell/test-support/render-with-router";
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
  mercado_pago_charge_in_progress: null,
  refunds_on_cancel: [],
  cancel_authorization_required: false,
  adjust_authorization_required: false,
  sale_discount_authorization_required: false,
  sale_discount_refusal: null,
  sale_discount: null,
  subtotal: 476_000,
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
  mercado_pago_charge_in_progress: null,
  refunds_on_cancel: [],
  cancel_authorization_required: false,
  adjust_authorization_required: false,
  sale_discount_authorization_required: false,
  sale_discount_refusal: null,
  sale_discount: null,
  subtotal: 626_000,
};
const COMPLETED: ChargeSaleInCashOutcome = {
  kind: "completed",
  sale_id: "sale-1",
  total: 476_000,
  tendered: 500_000,
  change: 24_000,
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

const COVERED: CashChargeAnswer = { kind: "covered", applied: 476_000, change: 24_000 };

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
};

export type Overrides = {
  paymentMethodAvailability?: () => Promise<PaymentMethodAvailability | null>;
  startMercadoPagoCharge?: (
    saleId: string,
    method: MercadoPagoMethod,
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
  cashCharge?: (saleId: string, tendered: number) => Promise<CashChargeAnswer>;
  chargeSaleInCash?: (saleId: string, tendered: number) => Promise<ChargeSaleInCashOutcome>;
  chargeSaleByTransfer?: (saleId: string, amount: number) => Promise<ChargeSaleByTransferOutcome>;
  chargeSaleOnStandaloneTerminal?: (
    saleId: string,
    amount: number,
  ) => Promise<ChargeSaleOnStandaloneTerminalOutcome>;
  receiptPrintStatus?: (saleId: string) => Promise<ReceiptPrintStatusOutcome>;
};

const PRINTED: ReceiptPrintStatusOutcome = {
  kind: "found",
  next_copy: { kind: "original" },
  printed: true,
  standing: "printed",
  comprobante: { kind: "none" },
};

export async function renderScreen(overrides: Overrides = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const currentSale = vi.fn(overrides.currentSale ?? (async () => SALE_OF_ONE_LINE));
  const cashCharge = vi.fn(overrides.cashCharge ?? (async () => COVERED));
  const chargeSaleInCash = vi.fn(overrides.chargeSaleInCash ?? (async () => COMPLETED));
  const chargeSaleByTransfer = vi.fn(
    overrides.chargeSaleByTransfer ?? (async () => TRANSFER_COMPLETED),
  );
  const chargeSaleOnStandaloneTerminal = vi.fn(
    overrides.chargeSaleOnStandaloneTerminal ?? (async () => STANDALONE_TERMINAL_COMPLETED),
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
  const onSessionInvalid = vi.fn();
  const screen = await render(
    <ChargeScreen
      sessionId="s1"
      person={overrides.person ?? PERSON}
      registerName="Caja 1"
      lock={() => {}}
      currentSale={currentSale}
      cashCharge={cashCharge}
      chargeSaleInCash={chargeSaleInCash}
      chargeSaleByTransfer={chargeSaleByTransfer}
      chargeSaleOnStandaloneTerminal={chargeSaleOnStandaloneTerminal}
      paymentMethodAvailability={paymentMethodAvailability}
      startMercadoPagoCharge={startMercadoPagoCharge}
      followMercadoPagoCharge={followMercadoPagoCharge}
      abandonMercadoPagoCharge={abandonMercadoPagoCharge}
      receiptPrintStatus={receiptPrintStatus}
      onSessionInvalid={onSessionInvalid}
    />,
  );
  return {
    screen,
    currentSale,
    cashCharge,
    chargeSaleInCash,
    chargeSaleByTransfer,
    chargeSaleOnStandaloneTerminal,
    paymentMethodAvailability,
    startMercadoPagoCharge,
    followMercadoPagoCharge,
    abandonMercadoPagoCharge,
    receiptPrintStatus,
    onSessionInvalid,
  };
}

export type Screen = Awaited<ReturnType<typeof renderScreen>>["screen"];

export async function chooseCash(screen: Screen) {
  await userEvent.click(screen.getByText("Efectivo", { exact: true }));
}

export async function chooseTransfer(screen: Screen) {
  await userEvent.click(screen.getByText("Transferencia", { exact: true }));
}

export async function chooseStandaloneTerminal(screen: Screen) {
  await userEvent.click(screen.getByText("Terminal independiente", { exact: true }));
}

export async function chooseQr(screen: Screen) {
  await userEvent.click(screen.getByText("QR de Mercado Pago", { exact: true }));
}

export async function choosePoint(screen: Screen) {
  await userEvent.click(screen.getByText("Point integrada", { exact: true }));
}

export async function chargeInCash(screen: Screen, tendered: string) {
  await chooseCash(screen);
  await userEvent.fill(
    screen.getByRole("textbox", { name: "Importe entregado por el cliente" }),
    tendered,
  );
  await userEvent.click(screen.getByRole("button", { name: "Completar venta" }));
}

export function saleWithChargeInProgress(
  method: MercadoPagoMethod,
  remainingSeconds: number,
): OpenSale {
  return {
    ...SALE_OF_ONE_LINE,
    lines_lock: "mercado_pago_charge_in_progress",
    cancel_refusal: "mercado_pago_charge_in_progress",
    mercado_pago_charge_in_progress: {
      payment_transaction_id: method === "POINT" ? POINT_PAYMENT_ID : QR_PAYMENT_ID,
      method,
      amount: 476_000,
      remaining_seconds: remainingSeconds,
      wait_seconds: 180,
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
