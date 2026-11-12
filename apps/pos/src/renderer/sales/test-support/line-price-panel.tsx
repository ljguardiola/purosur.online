import type {
  AdjustSaleLineOutcome,
  Authorization,
  ManualAdjustmentRequest,
  OpenSale,
  PreviewSaleLineAdjustmentOutcome,
  SignInUser,
} from "@purosur/contracts";
import { vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../../shell/test-support/render-with-router";
import { LinePricePanel } from "../line-price-panel";
import { SALE_OF_YERBA } from "./sale-screen";

const AUTHORIZERS: SignInUser[] = [
  { id: "u3", first_name: "Sofía" },
  { id: "u2", first_name: "Grace" },
];

export const CHANGED: AdjustSaleLineOutcome = {
  kind: "changed",
  sale: SALE_OF_YERBA,
  removed_sale_discount: false,
};

export const TEN_PERCENT: PreviewSaleLineAdjustmentOutcome = {
  kind: "preview",
  discount_amount: 47_600,
  line_total: 428_400,
};

export type LinePricePanelOptions = {
  previewAdjustment?: (
    lineId: string,
    adjustment: ManualAdjustmentRequest,
  ) => Promise<PreviewSaleLineAdjustmentOutcome>;
  authorizationRequired?: boolean;
  saleUnit?: "UNIT" | "KG";
  quantity?: number;
  lineTotal?: number;
  adjustSaleLine?: (
    lineId: string,
    adjustment: ManualAdjustmentRequest,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<AdjustSaleLineOutcome>;
};

export async function renderLinePricePanel({
  authorizationRequired = false,
  saleUnit = "UNIT",
  quantity = 2,
  lineTotal = 476_000,
  adjustSaleLine = async () => CHANGED,
  previewAdjustment = async () => ({ kind: "unknown_line" }),
}: LinePricePanelOptions = {}) {
  const adjust = vi.fn(adjustSaleLine);
  const preview = vi.fn(previewAdjustment);
  const requested: string[] = [];
  const loadAuthorizers = async (permission: string) => {
    requested.push(permission);
    return AUTHORIZERS;
  };
  const handlers = {
    onAdjusted: vi.fn<(sale: OpenSale, removedSaleDiscount: boolean) => void>(),
    onSaleGone: vi.fn(),
    onSessionInvalid: vi.fn(),
    onClose: vi.fn(),
  };
  const screen = await render(
    <LinePricePanel
      lineId="line-1"
      productName="Yerba mate 1 kg"
      listUnitPrice={238_000}
      quantity={quantity}
      lineTotal={lineTotal}
      saleUnit={saleUnit}
      authorizationRequired={authorizationRequired}
      loadAuthorizers={loadAuthorizers}
      adjustSaleLine={adjust}
      previewAdjustment={preview}
      {...handlers}
    />,
  );
  return { screen, adjust, preview, requested, ...handlers };
}

type Screen = Awaited<ReturnType<typeof renderLinePricePanel>>["screen"];

export async function chooseOption(screen: Screen, name: string) {
  const label = screen.getByRole("radio", { name }).element().closest("label");
  if (label === null) {
    throw new Error(`no label found for the option ${name}`);
  }
  await userEvent.click(label);
}

export async function typeValue(screen: Screen, label: string, value: string) {
  await userEvent.fill(screen.getByRole("textbox", { name: label }), value);
}

export async function typePrice(screen: Screen, value: string) {
  await typeValue(screen, "PRECIO NUEVO POR UNIDAD", value);
}

export async function typeOtherReason(screen: Screen, reason: string) {
  await chooseOption(screen, "Otro");
  await typeValue(screen, "Motivo", reason);
}

export async function apply(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
}
