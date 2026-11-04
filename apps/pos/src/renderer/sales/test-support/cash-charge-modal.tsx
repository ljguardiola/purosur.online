import type {
  Authorization,
  CashChargeAnswer,
  ChargeSaleInCashOutcome,
  ChargeSaleInCashWithChangeDiscountOutcome,
  PreviewSaleDiscountOutcome,
  SaleDiscountRequest,
  SignInUser,
} from "@purosur/contracts";
import { onTestFinished, vi } from "vitest";
import { page } from "vitest/browser";
import type { SignedInPerson } from "../../shell/signed-in-person";
import { render } from "../../shell/test-support/render-with-router";
import type { CashChargeModalProps } from "../cash-charge-modal";
import { CashChargeModal } from "../cash-charge-modal";

const AMOUNT_FIELD = "Importe entregado por el cliente";
export const DISCOUNT_FIELD = "Descuento por falta de cambio";

const PERSON: SignedInPerson = { user_id: "u1", first_name: "Ada", abilities: [] };
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

type ModalSale = { total: number; paid: number; pending: number; subtotal: number };

function previewOf(discount: number): PreviewSaleDiscountOutcome {
  return {
    kind: "preview",
    subtotal: 960_000,
    discount_amount: discount,
    total: 960_000 - discount,
  };
}

async function answerLikeTheCore(tendered: number, discount?: number): Promise<CashChargeAnswer> {
  const owed = 960_000 - (discount ?? 0);
  return tendered >= owed
    ? { kind: "covered", applied: owed, change: tendered - owed, cash_rounding: 0 }
    : { kind: "partial", applied: tendered, pending: owed - tendered };
}

export type ModalOptions = {
  sale?: ModalSale;
  authorizationRequired?: boolean;
  appliedDiscountAmount?: number | null;
  discountOffered?: boolean;
  readCharge?: (tendered: number, discount?: number) => Promise<CashChargeAnswer>;
  charge?: (tendered: number) => Promise<ChargeSaleInCashOutcome>;
  chargeWithDiscount?: (
    tendered: number,
    discount: number,
    authorization: Authorization | undefined,
  ) => Promise<ChargeSaleInCashWithChangeDiscountOutcome>;
  previewSaleDiscount?: (discount: SaleDiscountRequest) => Promise<PreviewSaleDiscountOutcome>;
};

export async function renderCashChargeModal({
  sale = SALE_OF_9600,
  authorizationRequired = false,
  appliedDiscountAmount = null,
  discountOffered = true,
  readCharge = answerLikeTheCore,
  charge = async () => COMPLETED,
  chargeWithDiscount = async () => COMPLETED,
  previewSaleDiscount = async (discount) => previewOf(discount.value),
}: ModalOptions = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const readCashCharge = vi.fn(readCharge);
  const chargeSale = vi.fn(charge);
  const chargeSaleWithDiscount = vi.fn(chargeWithDiscount);
  const preview = vi.fn(previewSaleDiscount);
  const requestedAuthorizers: string[] = [];
  const callbacks = {
    onChooseAnotherMethod: vi.fn(),
    onCompleted: vi.fn(),
    onPartiallyPaid: vi.fn(),
    onSaleUnavailable: vi.fn(),
    onSessionInvalid: vi.fn(),
  };
  const propsFor = (shown: ModalSale): CashChargeModalProps => ({
    saleId: "sale-1",
    ...shown,
    discountOffered,
    appliedDiscountAmount,
    authorizationRequired,
    person: PERSON,
    loadAuthorizers: async (permission) => {
      requestedAuthorizers.push(permission);
      return AUTHORIZERS;
    },
    previewSaleDiscount: preview,
    readCharge: readCashCharge,
    charge: chargeSale,
    chargeWithDiscount: chargeSaleWithDiscount,
    ...callbacks,
  });
  const screen = await render(<CashChargeModal {...propsFor(sale)} />);
  return {
    screen,
    readCashCharge,
    chargeSale,
    chargeSaleWithDiscount,
    preview,
    requestedAuthorizers,
    callbacks,
    showSale: (shown: ModalSale) => screen.rerender(<CashChargeModal {...propsFor(shown)} />),
    field: screen.getByRole("textbox", { name: AMOUNT_FIELD }),
    discountField: screen.getByRole("textbox", { name: DISCOUNT_FIELD }),
    complete: screen.getByRole("button", { name: "Completar venta" }),
  };
}

export type CashChargeModalScreen = Awaited<ReturnType<typeof renderCashChargeModal>>;

export function valueBeside(screen: CashChargeModalScreen["screen"], label: string): string | null {
  return screen.getByText(label, { exact: true }).element().nextElementSibling?.textContent ?? null;
}
