import type {
  Authorization,
  CashChargeAmounts,
  CashChargeAmountsAnswer,
  CashChargeAnswer,
  ChargeSaleInCashOutcome,
  ChargeSaleInCashWithChangeDiscountOutcome,
  SignInUser,
} from "@purosur/contracts";
import { onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../../shell/test-support/render-with-router";
import type { CashChargePanelProps } from "../cash-charge-panel";
import { CashChargePanel } from "../cash-charge-panel";

export const AMOUNT_FIELD = "RECIBIDO";
export const OTHER_DISCOUNT_FIELD = "Otro";

const AUTHORIZERS: SignInUser[] = [{ id: "u3", first_name: "Sofía" }];

const COMPLETED: ChargeSaleInCashOutcome = {
  kind: "completed",
  sale_id: "sale-1",
  total: 950_000,
  tendered: 1_000_000,
  change: 50_000,
  cash_rounding: 0,
};

const SALE_OF_9600 = { total: 960_000, paid: 0, pending: 960_000, subtotal: 960_000 };

type PanelSale = { total: number; paid: number; pending: number; subtotal?: number };

export function amountsOf(
  amountToCharge: number,
  rest: Partial<CashChargeAmounts> = {},
): CashChargeAmounts {
  return {
    kind: "amounts",
    amount_due: amountToCharge + (rest.cash_rounding ?? 0),
    amount_to_charge: amountToCharge,
    cash_rounding: 0,
    quick_amounts: [amountToCharge],
    change_discount_option: null,
    ...rest,
  };
}

async function answerLikeTheCore(tendered: number, discount?: number): Promise<CashChargeAnswer> {
  const owed = 960_000 - (discount ?? 0);
  return tendered >= owed
    ? { kind: "covered", applied: owed, change: tendered - owed, cash_rounding: 0 }
    : { kind: "partial", applied: tendered, pending: owed - tendered };
}

export type PanelOptions = {
  sale?: PanelSale;
  authorizationRequired?: boolean;
  appliedDiscountAmount?: number | null;
  discountOffered?: boolean;
  readAmounts?: (discount?: number) => Promise<CashChargeAmountsAnswer | null>;
  readCharge?: (tendered: number, discount?: number) => Promise<CashChargeAnswer>;
  charge?: (tendered: number) => Promise<ChargeSaleInCashOutcome>;
  chargeWithDiscount?: (
    tendered: number,
    discount: number,
    authorization: Authorization | undefined,
  ) => Promise<ChargeSaleInCashWithChangeDiscountOutcome>;
};

export async function renderCashChargePanel({
  sale = SALE_OF_9600,
  authorizationRequired = false,
  appliedDiscountAmount = null,
  discountOffered = true,
  readAmounts,
  readCharge = answerLikeTheCore,
  charge = async () => COMPLETED,
  chargeWithDiscount = async () => COMPLETED,
}: PanelOptions = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  let shownSale = sale;
  const readCashChargeAmounts = vi.fn(
    readAmounts ?? (async (discount?: number) => amountsOf(shownSale.pending - (discount ?? 0))),
  );
  const readCashCharge = vi.fn(readCharge);
  const chargeSale = vi.fn(charge);
  const chargeSaleWithDiscount = vi.fn(chargeWithDiscount);
  const requestedAuthorizers: string[] = [];
  const callbacks = {
    onBack: vi.fn(),
    onCompleted: vi.fn(),
    onPartiallyPaid: vi.fn(),
    onSaleUnavailable: vi.fn(),
    onSessionInvalid: vi.fn(),
  };
  const propsFor = ({ subtotal, ...shown }: PanelSale): CashChargePanelProps => ({
    saleId: "sale-1",
    ...shown,
    subtotal: subtotal ?? shown.total,
    discountOffered,
    appliedDiscountAmount,
    authorizationRequired,
    loadAuthorizers: async (permission) => {
      requestedAuthorizers.push(permission);
      return AUTHORIZERS;
    },
    readAmounts: readCashChargeAmounts,
    readCharge: readCashCharge,
    charge: chargeSale,
    chargeWithDiscount: chargeSaleWithDiscount,
    ...callbacks,
  });
  const screen = await render(<CashChargePanel {...propsFor(sale)} />);
  return {
    screen,
    readCashChargeAmounts,
    readCashCharge,
    chargeSale,
    chargeSaleWithDiscount,
    requestedAuthorizers,
    callbacks,
    showSale: (shown: PanelSale) => {
      shownSale = shown;
      return screen.rerender(<CashChargePanel {...propsFor(shown)} />);
    },
    field: screen.getByRole("textbox", { name: AMOUNT_FIELD }),
    discountField: screen.getByRole("textbox", { name: OTHER_DISCOUNT_FIELD }),
    complete: screen.getByRole("button", { name: "Cobrar" }),
  };
}

export type CashChargePanelScreen = Awaited<ReturnType<typeof renderCashChargePanel>>;

export async function typeDiscount(panel: CashChargePanelScreen, typed: string) {
  if (panel.screen.getByRole("group", { name: "FALTA DE CAMBIO" }).query() === null) {
    await userEvent.keyboard("{F3}");
  }
  await userEvent.fill(panel.discountField, typed);
}

export function valueBeside(screen: CashChargePanelScreen["screen"], label: string): string | null {
  return screen.getByText(label, { exact: true }).element().nextElementSibling?.textContent ?? null;
}
