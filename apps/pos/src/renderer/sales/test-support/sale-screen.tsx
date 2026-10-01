import type {
  AddProductOutcome,
  CancelSaleOutcome,
  ChangeLineQuantityOutcome,
  OpenSale,
  RemoveSaleLineOutcome,
  ScanProductOutcome,
  SearchProductsOutcome,
} from "@purosur/contracts";
import { onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../../shell/test-support/render-with-router";
import type { SaleScreenProps } from "../sale-screen";
import { SaleScreen } from "../sale-screen";

const PERSON = { user_id: "u1", first_name: "Ada", permission_keys: ["sell_and_charge"] };
// 12:02 UTC is 09:02 in Argentina.
const OPENED_AT = "2026-09-30T12:02:00.000Z";
const FIELD_NAME = "Producto";
export const PLACEHOLDER = "Escaneá o escribí el nombre del producto";
export const NOT_PERMITTED_TITLE = "No tenés el permiso de vender y cobrar";
export const NOT_PERMITTED_HELP = "Quien administra los roles te lo puede dar en el backoffice.";

export const YERBA = {
  id: "line-1",
  product_id: "p1",
  product_name: "Yerba mate 1 kg",
  quantity: 2,
  list_unit_price: 238_000,
  discount_amount: 0,
  promotion: null,
  line_total: 476_000,
};
export const ALFAJOR = {
  id: "line-2",
  product_id: "p2",
  product_name: "Alfajor triple",
  quantity: 1,
  list_unit_price: 150_000,
  discount_amount: 0,
  promotion: null,
  line_total: 150_000,
};
export const SALE_OF_YERBA: OpenSale = {
  id: "sale-1",
  lines: [YERBA],
  total: 476_000,
  charge_refusal: null,
};
export const SALE_OF_YERBA_AND_ALFAJOR: OpenSale = {
  id: "sale-1",
  lines: [YERBA, ALFAJOR],
  total: 626_000,
  charge_refusal: null,
};

export type Overrides = Partial<SaleScreenProps> & { registerName?: string | null };

export async function renderScreen({ registerName = "Caja 1", ...overrides }: Overrides = {}) {
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
  const addProduct =
    overrides.addProduct ??
    vi.fn(async (): Promise<AddProductOutcome> => ({ kind: "product_unavailable" }));
  const changeLineQuantity =
    overrides.changeLineQuantity ??
    vi.fn(async (): Promise<ChangeLineQuantityOutcome> => ({ kind: "unavailable" }));
  const removeSaleLine =
    overrides.removeSaleLine ??
    vi.fn(async (): Promise<RemoveSaleLineOutcome> => ({ kind: "unavailable" }));
  const cancelSale =
    overrides.cancelSale ??
    vi.fn(async (): Promise<CancelSaleOutcome> => ({ kind: "unavailable" }));
  const onSessionInvalid = overrides.onSessionInvalid ?? vi.fn();
  const screen = await render(
    <SaleScreen
      sessionId="s1"
      person={PERSON}
      registerName={registerName}
      openedAt={OPENED_AT}
      lock={() => {}}
      currentSale={currentSale}
      scanProduct={scanProduct}
      searchProducts={searchProducts}
      addProduct={addProduct}
      changeLineQuantity={changeLineQuantity}
      removeSaleLine={removeSaleLine}
      cancelSale={cancelSale}
      onSessionInvalid={onSessionInvalid}
    />,
  );
  return { screen, field: screen.getByRole("combobox", { name: FIELD_NAME }) };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

export async function scan(field: ReturnType<typeof page.getByRole>, code: string) {
  await field.fill(code);
  await userEvent.keyboard("{Enter}");
}
