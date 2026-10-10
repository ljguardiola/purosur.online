import type {
  CashChargeAnswer,
  ChargeSaleByTransferOutcome,
  ChargeSaleInCashOutcome,
  CurrentSaleAnswer,
  FollowMercadoPagoQrChargeOutcome,
  OpenSale,
  ReceiptPrintStatusOutcome,
  RegisterStatus,
  RetryReceiptPrintOutcome,
  StartMercadoPagoQrChargeOutcome,
} from "@purosur/contracts";
import { onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { CoreData } from "../../platform/use-core-query";
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
  quantity: 2,
  list_unit_price: 238_000,
  discount_amount: 0,
  promotion: null,
  line_total: 476_000,
};
const ALFAJOR = {
  id: "line-2",
  product_id: "p2",
  product_name: "Alfajor triple",
  quantity: 1,
  list_unit_price: 150_000,
  discount_amount: 0,
  promotion: null,
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
  refunds_on_cancel: [],
  cancel_authorization_required: false,
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
  refunds_on_cancel: [],
  cancel_authorization_required: false,
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

export const SALE_WITH_PART_PAID: OpenSale = {
  ...SALE_OF_ONE_LINE,
  paid: 100_000,
  pending: 376_000,
  lines_lock: "approved_payment",
  cancel_refusal: null,
};

const COVERED: CashChargeAnswer = { kind: "covered", applied: 476_000, change: 24_000 };

export const QR_PAYMENT_ID = "019a0000-0000-7000-8000-0000000000a1";
export const QR_ORDER_SHOWN: StartMercadoPagoQrChargeOutcome = {
  kind: "order_shown",
  payment_transaction_id: QR_PAYMENT_ID,
  amount: 476_000,
  remaining_seconds: 180,
  wait_seconds: 180,
};
const QR_WAITING: FollowMercadoPagoQrChargeOutcome = { kind: "waiting", remaining_seconds: 170 };

export function registerStatusWithCloud(cloud: RegisterStatus["cloud"]): CoreData<RegisterStatus> {
  return { status: "loaded", value: { conditions: [], cloud }, refreshing: false };
}

export type Overrides = {
  registerStatus?: CoreData<RegisterStatus>;
  startMercadoPagoQrCharge?: (
    saleId: string,
    amount: number,
  ) => Promise<StartMercadoPagoQrChargeOutcome>;
  followMercadoPagoQrCharge?: (
    paymentTransactionId: string,
  ) => Promise<FollowMercadoPagoQrChargeOutcome>;
  person?: ChargeScreenProps["person"];
  currentSale?: () => Promise<CurrentSaleAnswer>;
  cashCharge?: (saleId: string, tendered: number) => Promise<CashChargeAnswer>;
  chargeSaleInCash?: (saleId: string, tendered: number) => Promise<ChargeSaleInCashOutcome>;
  chargeSaleByTransfer?: (saleId: string, amount: number) => Promise<ChargeSaleByTransferOutcome>;
  receiptPrintStatus?: (saleId: string) => Promise<ReceiptPrintStatusOutcome>;
  retryReceiptPrint?: (saleId: string) => Promise<RetryReceiptPrintOutcome>;
};

const PRINTED: ReceiptPrintStatusOutcome = {
  kind: "found",
  next_copy: { kind: "original" },
  printed: true,
  standing: "printed",
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
  const startMercadoPagoQrCharge = vi.fn(
    overrides.startMercadoPagoQrCharge ?? (async () => QR_ORDER_SHOWN),
  );
  const followMercadoPagoQrCharge = vi.fn(
    overrides.followMercadoPagoQrCharge ?? (async () => QR_WAITING),
  );
  const receiptPrintStatus = vi.fn(overrides.receiptPrintStatus ?? (async () => PRINTED));
  const retryReceiptPrint = vi.fn(
    overrides.retryReceiptPrint ??
      (async (): Promise<RetryReceiptPrintOutcome> => ({ kind: "not_offered" })),
  );
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
      registerStatus={overrides.registerStatus ?? registerStatusWithCloud("reachable")}
      startMercadoPagoQrCharge={startMercadoPagoQrCharge}
      followMercadoPagoQrCharge={followMercadoPagoQrCharge}
      receiptPrintStatus={receiptPrintStatus}
      retryReceiptPrint={retryReceiptPrint}
      onSessionInvalid={onSessionInvalid}
    />,
  );
  return {
    screen,
    currentSale,
    cashCharge,
    chargeSaleInCash,
    chargeSaleByTransfer,
    startMercadoPagoQrCharge,
    followMercadoPagoQrCharge,
    receiptPrintStatus,
    retryReceiptPrint,
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

export async function chooseQr(screen: Screen) {
  await userEvent.click(screen.getByText("QR de Mercado Pago", { exact: true }));
}

export async function chargeInCash(screen: Screen, tendered: string) {
  await chooseCash(screen);
  await userEvent.fill(
    screen.getByRole("textbox", { name: "Importe entregado por el cliente" }),
    tendered,
  );
  await userEvent.click(screen.getByRole("button", { name: "Completar venta" }));
}
