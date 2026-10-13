import type {
  FindCountableProductOutcome,
  InitialCountLine,
  ReadInitialCountOutcome,
  RecordInitialCountLineOutcome,
  SearchCountableProductsOutcome,
  WeighCountedProductOutcome,
  WithdrawInitialCountLineOutcome,
} from "@purosur/contracts";
import { onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { BarcodeReadings } from "../../shell/barcode-readings";
import { render } from "../../shell/test-support/render-with-router";
import type { InitialCountScreenProps } from "../initial-count-screen";
import { InitialCountScreen } from "../initial-count-screen";

export { deferred } from "../../platform/test-support/deferred";

export const QUESO_LINE: InitialCountLine = {
  movement_id: "m1",
  product_id: "p1",
  product_name: "Queso cremoso",
  sale_unit: "KG",
  counted: 4400,
  expires_on: "2026-12-03",
};
export const YERBA_LINE: InitialCountLine = {
  movement_id: "m2",
  product_id: "p2",
  product_name: "Yerba mate 1 kg",
  sale_unit: "UNIT",
  counted: 24_000,
  expires_on: null,
};

export const YERBA_PRODUCT = {
  product_id: "p2",
  name: "Yerba mate 1 kg",
  sale_unit: "UNIT",
} as const;
export const QUESO_PRODUCT = { product_id: "p1", name: "Queso cremoso", sale_unit: "KG" } as const;

export const PLACEHOLDER = "Escaneá el producto o buscalo por nombre";

const PERSON: InitialCountScreenProps["person"] = {
  user_id: "u1",
  first_name: "Ada",
  abilities: ["record_initial_inventory"],
};

export function readOf(lines: InitialCountLine[], offered = true): ReadInitialCountOutcome {
  return { kind: "read", offered, lines };
}

type Overrides = Partial<
  Omit<InitialCountScreenProps, "person" | "readInitialCount"> & {
    person: InitialCountScreenProps["person"];
    readInitialCount: InitialCountScreenProps["readInitialCount"];
  }
>;

export async function renderScreen(overrides: Overrides = {}) {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const readInitialCount =
    overrides.readInitialCount ?? vi.fn(async (): Promise<ReadInitialCountOutcome> => readOf([]));
  const recordInitialCountLine =
    overrides.recordInitialCountLine ??
    vi.fn(async (): Promise<RecordInitialCountLineOutcome> => ({ kind: "unavailable" }));
  const withdrawInitialCountLine =
    overrides.withdrawInitialCountLine ??
    vi.fn(async (): Promise<WithdrawInitialCountLineOutcome> => ({ kind: "unavailable" }));
  const findCountableProduct =
    overrides.findCountableProduct ??
    vi.fn(async (): Promise<FindCountableProductOutcome> => ({ kind: "unknown_code" }));
  const searchCountableProducts =
    overrides.searchCountableProducts ??
    vi.fn(
      async (): Promise<SearchCountableProductsOutcome> => ({
        kind: "results",
        products: [],
        more: false,
      }),
    );
  const weighCountedProduct =
    overrides.weighCountedProduct ??
    vi.fn(async (): Promise<WeighCountedProductOutcome> => ({ kind: "scale_unavailable" }));
  const onSessionInvalid = overrides.onSessionInvalid ?? vi.fn();
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
      <InitialCountScreen
        person={overrides.person ?? PERSON}
        signOut={() => {}}
        readInitialCount={readInitialCount}
        recordInitialCountLine={recordInitialCountLine}
        withdrawInitialCountLine={withdrawInitialCountLine}
        findCountableProduct={findCountableProduct}
        searchCountableProducts={searchCountableProducts}
        weighCountedProduct={weighCountedProduct}
        onSessionInvalid={onSessionInvalid}
      />
    </BarcodeReadings>,
  );
  return {
    screen,
    field: screen.getByRole("combobox", { name: "Producto" }),
    readInitialCount,
    recordInitialCountLine,
    withdrawInitialCountLine,
    findCountableProduct,
    searchCountableProducts,
    weighCountedProduct,
    onSessionInvalid,
    readBarcode(code: string) {
      for (const listener of readers) listener(code);
    },
  };
}

export async function scan(field: ReturnType<typeof page.getByRole>, code: string) {
  await field.fill(code);
  await userEvent.keyboard("{Enter}");
}
