import type {
  ApplySaleDiscountOutcome,
  Authorization,
  OpenSale,
  PreviewSaleDiscountOutcome,
  SaleDiscountRequest,
  SignInUser,
} from "@purosur/contracts";
import { vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../../shell/test-support/render-with-router";
import { SaleDiscountPanel } from "../sale-discount-panel";
import { SALE_OF_YERBA } from "./sale-screen";

const AUTHORIZERS: SignInUser[] = [
  { id: "u3", first_name: "Sofía" },
  { id: "u2", first_name: "Grace" },
];

const APPLIED: ApplySaleDiscountOutcome = { kind: "applied", sale: SALE_OF_YERBA };
export const FIVE_PERCENT: PreviewSaleDiscountOutcome = {
  kind: "preview",
  subtotal: 5_070_000,
  discount_amount: 253_500,
  total: 4_816_500,
};

export type SaleDiscountPanelOptions = {
  authorizationRequired?: boolean;
  applySaleDiscount?: (
    discount: SaleDiscountRequest,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ApplySaleDiscountOutcome>;
  previewSaleDiscount?: (discount: SaleDiscountRequest) => Promise<PreviewSaleDiscountOutcome>;
};

export async function renderSaleDiscountPanel({
  authorizationRequired = false,
  applySaleDiscount = async () => APPLIED,
  previewSaleDiscount = async () => ({ kind: "no_open_sale" }),
}: SaleDiscountPanelOptions = {}) {
  const apply = vi.fn(applySaleDiscount);
  const preview = vi.fn(previewSaleDiscount);
  const requested: string[] = [];
  const loadAuthorizers = async (permission: string) => {
    requested.push(permission);
    return AUTHORIZERS;
  };
  const handlers = {
    onApplied: vi.fn<(sale: OpenSale) => void>(),
    onSaleGone: vi.fn(),
    onSessionInvalid: vi.fn(),
    onClose: vi.fn(),
  };
  const screen = await render(
    <SaleDiscountPanel
      subtotal={5_070_000}
      authorizationRequired={authorizationRequired}
      loadAuthorizers={loadAuthorizers}
      applySaleDiscount={apply}
      previewSaleDiscount={preview}
      {...handlers}
    />,
  );
  return { screen, apply, preview, requested, ...handlers };
}

type Screen = Awaited<ReturnType<typeof renderSaleDiscountPanel>>["screen"];

export async function typeValue(screen: Screen, label: string, value: string) {
  await userEvent.fill(screen.getByRole("textbox", { name: label }), value);
}

export async function chooseOption(screen: Screen, name: string) {
  const label = screen.getByRole("radio", { name }).element().closest("label");
  if (label === null) {
    throw new Error(`no label found for the option ${name}`);
  }
  await userEvent.click(label);
}

export async function typeOtherReason(screen: Screen, reason: string) {
  await chooseOption(screen, "Otro");
  await typeValue(screen, "Motivo", reason);
}

export async function submit(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
}

export async function fillValidPercentage(screen: Screen) {
  await typeValue(screen, "DESCUENTO", "5");
}
