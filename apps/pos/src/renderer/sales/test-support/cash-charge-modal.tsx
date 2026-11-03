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

export const AMOUNT_FIELD = "Importe entregado por el cliente";
export const DISCOUNT_FIELD = "Descuento por falta de cambio";

const PERSON: SignedInPerson = { user_id: "u1", first_name: "Ada", abilities: [] };
const AUTHORIZERS: SignInUser[] = [{ id: "u3", first_name: "Sofía" }];

export const NO_DISCOUNT_OFFERED = {
  discountOffered: false,
  subtotal: 960_000,
  appliedDiscountAmount: null,
  authorizationRequired: false,
  person: PERSON,
  loadAuthorizers: async (): Promise<SignInUser[]> => AUTHORIZERS,
  previewSaleDiscount: async (): Promise<PreviewSaleDiscountOutcome> => ({ kind: "no_open_sale" }),
  chargeWithDiscount: async (): Promise<ChargeSaleInCashWithChangeDiscountOutcome> => ({
    kind: "no_open_sale",
  }),
} satisfies Partial<CashChargeModalProps>;

const COMPLETED: ChargeSaleInCashOutcome = {
  kind: "completed",
  sale_id: "sale-1",
  total: 950_000,
  tendered: 1_000_000,
  change: 50_000,
};

const SALE_OF_9600 = { total: 960_000, paid: 0, pending: 960_000 };

export function previewOf(discount: number): PreviewSaleDiscountOutcome {
  return {
    kind: "preview",
    subtotal: 960_000,
    discount_amount: discount,
    total: 960_000 - discount,
  };
}

export async function answerLikeTheCore(
  tendered: number,
  discount?: number,
): Promise<CashChargeAnswer> {
  const owed = 960_000 - (discount ?? 0);
  return tendered >= owed
    ? { kind: "covered", applied: owed, change: tendered - owed }
    : { kind: "partial", applied: tendered, pending: owed - tendered };
}

export type ModalOptions = {
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

export async function renderDiscountModal({
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
  const screen = await render(
    <CashChargeModal
      saleId="sale-1"
      {...SALE_OF_9600}
      subtotal={960_000}
      discountOffered={discountOffered}
      appliedDiscountAmount={appliedDiscountAmount}
      authorizationRequired={authorizationRequired}
      person={PERSON}
      loadAuthorizers={async (permission) => {
        requestedAuthorizers.push(permission);
        return AUTHORIZERS;
      }}
      previewSaleDiscount={preview}
      readCharge={readCashCharge}
      charge={chargeSale}
      chargeWithDiscount={chargeSaleWithDiscount}
      {...callbacks}
    />,
  );
  return {
    screen,
    readCashCharge,
    chargeSale,
    chargeSaleWithDiscount,
    preview,
    requestedAuthorizers,
    callbacks,
    field: screen.getByRole("textbox", { name: AMOUNT_FIELD }),
    discountField: screen.getByRole("textbox", { name: DISCOUNT_FIELD }),
    complete: screen.getByRole("button", { name: "Completar venta" }),
  };
}

export type DiscountModal = Awaited<ReturnType<typeof renderDiscountModal>>;

export function valueBeside(screen: DiscountModal["screen"], label: string): string | null {
  return screen.getByText(label, { exact: true }).element().nextElementSibling?.textContent ?? null;
}
