import type {
  AddProductOutcome,
  AddWeighedProductOutcome,
  AdjustSaleLineOutcome,
  ApplySaleDiscountOutcome,
  CancelPaidSaleOutcome,
  CancelSaleOutcome,
  ChangeLineQuantityOutcome,
  ChangeLineWeightOutcome,
  FindProductByCodeOutcome,
  OpenSale,
  PaymentMethodAvailability,
  PreviewSaleDiscountOutcome,
  PreviewSaleLineAdjustmentOutcome,
  RemoveSaleLineOutcome,
  ScanProductOutcome,
  SearchProductsOutcome,
  WeighLineOutcome,
  WeighProductOutcome,
} from "@purosur/contracts";
import { onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { BarcodeReadings } from "../../shell/barcode-readings";
import { render } from "../../shell/test-support/render-with-router";
import type { SaleScreenProps } from "../sale-screen";
import { SaleScreen } from "../sale-screen";

const PERSON: SaleScreenProps["person"] = {
  user_id: "u1",
  first_name: "Ada",
  abilities: ["open_cash_session"],
};
const FIELD_NAME = "Producto";
export const AVAILABLE: PaymentMethodAvailability = {
  qr: "available",
  point: "available",
  point_minimum: 1500,
  qr_minimum: 1500,
};

export const PLACEHOLDER = "Escaneá o escribí el nombre";
export const NOT_PERMITTED_TITLE = "No tenés el permiso de vender y cobrar";
export const NOT_PERMITTED_HELP = "Quien administra los roles te lo puede dar en el backoffice.";

export const YERBA = {
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
export const ALFAJOR = {
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
export const QUESO = {
  id: "line-3",
  product_id: "p-queso",
  product_name: "Queso cremoso",
  sale_unit: "KG" as const,
  weight_source: "MANUAL" as const,
  quantity: 1250,
  list_unit_price: 1_250_000,
  discount_amount: 0,
  promotion: null,
  manual_adjustment: null,
  line_total: 1_562_500,
};
export const SALE_OF_QUESO: OpenSale = {
  id: "sale-1",
  lines: [QUESO],
  total: 1_562_500,
  paid: 0,
  pending: 1_562_500,
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
  gross_subtotal: 1_562_500,
  subtotal: 1_562_500,
  promotion_savings: 0,
};
export const SALE_OF_YERBA: OpenSale = {
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
export const SALE_OF_YERBA_AND_ALFAJOR: OpenSale = {
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

export type Overrides = Partial<SaleScreenProps>;

export async function renderScreen(overrides: Overrides = {}) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  const currentSale = overrides.currentSale ?? vi.fn(async () => null);
  const scanProduct =
    overrides.scanProduct ??
    vi.fn(async (): Promise<ScanProductOutcome> => ({ kind: "unknown_code" }));
  const searchProducts =
    overrides.searchProducts ??
    vi.fn(
      async (): Promise<SearchProductsOutcome> => ({ kind: "results", products: [], more: false }),
    );
  const findProductByCode =
    overrides.findProductByCode ??
    vi.fn(async (): Promise<FindProductByCodeOutcome> => ({ kind: "unknown_code" }));
  const addProduct =
    overrides.addProduct ??
    vi.fn(async (): Promise<AddProductOutcome> => ({ kind: "product_unavailable" }));
  const changeLineQuantity =
    overrides.changeLineQuantity ??
    vi.fn(async (): Promise<ChangeLineQuantityOutcome> => ({ kind: "unavailable" }));
  const addWeighedProduct =
    overrides.addWeighedProduct ??
    vi.fn(async (): Promise<AddWeighedProductOutcome> => ({ kind: "unavailable" }));
  const weighProduct =
    overrides.weighProduct ??
    vi.fn(async (): Promise<WeighProductOutcome> => ({ kind: "scale_unavailable" }));
  const weighLine =
    overrides.weighLine ??
    vi.fn(async (): Promise<WeighLineOutcome> => ({ kind: "scale_unavailable" }));
  const changeLineWeight =
    overrides.changeLineWeight ??
    vi.fn(async (): Promise<ChangeLineWeightOutcome> => ({ kind: "unavailable" }));
  const adjustSaleLine =
    overrides.adjustSaleLine ??
    vi.fn(async (): Promise<AdjustSaleLineOutcome> => ({ kind: "unavailable" }));
  const previewSaleLineAdjustment =
    overrides.previewSaleLineAdjustment ??
    vi.fn(async (): Promise<PreviewSaleLineAdjustmentOutcome> => ({ kind: "unavailable" }));
  const applySaleDiscount =
    overrides.applySaleDiscount ??
    vi.fn(async (): Promise<ApplySaleDiscountOutcome> => ({ kind: "no_open_sale" }));
  const previewSaleDiscount =
    overrides.previewSaleDiscount ??
    vi.fn(async (): Promise<PreviewSaleDiscountOutcome> => ({ kind: "unavailable" }));
  const removeSaleLine =
    overrides.removeSaleLine ??
    vi.fn(async (): Promise<RemoveSaleLineOutcome> => ({ kind: "unavailable" }));
  const cancelSale =
    overrides.cancelSale ??
    vi.fn(async (): Promise<CancelSaleOutcome> => ({ kind: "unavailable" }));
  const cancelPaidSale =
    overrides.cancelPaidSale ??
    vi.fn(async (): Promise<CancelPaidSaleOutcome> => ({ kind: "unavailable" }));
  const loadAuthorizers = overrides.loadAuthorizers ?? vi.fn(async () => []);
  const onSessionInvalid = overrides.onSessionInvalid ?? vi.fn();
  const registerStatus = overrides.registerStatus ?? { status: "failed" as const, retry: vi.fn() };
  const paymentMethodAvailability = vi.fn(
    overrides.paymentMethodAvailability ?? (async () => AVAILABLE),
  );
  const readers = new Set<(code: string) => void>();
  const screen = await render(
    <BarcodeReadings
      onBarcodeRead={(listener) => {
        readers.add(listener);
        return () => {
          readers.delete(listener);
        };
      }}
    >
      <SaleScreen
        sessionId="s1"
        person={overrides.person ?? PERSON}
        lock={overrides.lock ?? (() => {})}
        currentSale={currentSale}
        scanProduct={scanProduct}
        searchProducts={searchProducts}
        findProductByCode={findProductByCode}
        addProduct={addProduct}
        addWeighedProduct={addWeighedProduct}
        weighProduct={weighProduct}
        weighLine={weighLine}
        changeLineQuantity={changeLineQuantity}
        changeLineWeight={changeLineWeight}
        adjustSaleLine={adjustSaleLine}
        previewSaleLineAdjustment={previewSaleLineAdjustment}
        applySaleDiscount={applySaleDiscount}
        previewSaleDiscount={previewSaleDiscount}
        removeSaleLine={removeSaleLine}
        cancelSale={cancelSale}
        cancelPaidSale={cancelPaidSale}
        loadAuthorizers={loadAuthorizers}
        onSessionInvalid={onSessionInvalid}
        registerStatus={registerStatus}
        paymentMethodAvailability={paymentMethodAvailability}
      />
    </BarcodeReadings>,
  );
  return {
    screen,
    paymentMethodAvailability,
    field: screen.getByRole("combobox", { name: FIELD_NAME }),
    readBarcode(code: string) {
      for (const listener of readers) listener(code);
    },
  };
}

export { deferred } from "../../platform/test-support/deferred";

export async function scan(field: ReturnType<typeof page.getByRole>, code: string) {
  await field.fill(code);
  await userEvent.keyboard("{Enter}");
}

export function pressKeypad(key: "+" | "-") {
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      code: key === "+" ? "NumpadAdd" : "NumpadSubtract",
      bubbles: true,
      cancelable: true,
    }),
  );
}

const ALMENDRAS = {
  ...QUESO,
  id: "line-a",
  product_id: "p-almendras",
  product_name: "Almendras peladas",
  quantity: 325,
  list_unit_price: 1_890_000,
  line_total: 614_250,
};
const AVENA = {
  ...QUESO,
  id: "line-b",
  product_id: "p-avena",
  product_name: "Avena arrollada",
  quantity: 1000,
  list_unit_price: 320_000,
  line_total: 320_000,
};
const YERBA_ORGANICA = {
  ...YERBA,
  id: "line-c",
  product_id: "p-yerba",
  product_name: "Yerba mate orgánica 1 kg",
  quantity: 2,
  list_unit_price: 695_000,
  line_total: 1_390_000,
};
const PASAS = {
  ...QUESO,
  id: "line-d",
  product_id: "p-pasas",
  product_name: "Pasas de uva",
  quantity: 250,
  list_unit_price: 780_000,
  line_total: 195_000,
};
export const SALE_OF_FOUR_LINES: OpenSale = {
  ...SALE_OF_YERBA,
  lines: [ALMENDRAS, AVENA, YERBA_ORGANICA, PASAS],
  total: 2_519_250,
  pending: 2_519_250,
  gross_subtotal: 2_519_250,
  subtotal: 2_519_250,
};
