import type {
  ConsultProductOutcome,
  ProductToConsult,
  SearchProductsOutcome,
} from "@purosur/contracts";
import { onTestFinished, vi } from "vitest";
import { page } from "vitest/browser";
import { BarcodeReadings } from "../../shell/barcode-readings";
import type { RegisterStatusData } from "../../shell/register-status-context";
import { RegisterStatusProvider } from "../../shell/register-status-context";
import { render } from "../../shell/test-support/render-with-router";
import type { ProductConsultationScreenProps } from "../product-consultation-screen";
import { ProductConsultationScreen } from "../product-consultation-screen";
import { AVAILABLE, SALE_OF_YERBA_AND_ALFAJOR } from "./sale-screen";

const TUESDAY = 2;

export const ALMENDRAS: Extract<ConsultProductOutcome, { kind: "consulted" }> = {
  kind: "consulted",
  product_id: "almendras",
  name: "Almendras peladas",
  sale_unit: "KG",
  unit_price: 1_890_000,
  promotion: { benefit: { kind: "PERCENT_OFF", percent: 10 }, weekdays: [TUESDAY] },
  weight_thousandths: 410,
  amount: 697_410,
  stock_thousandths: 12_400,
};

export const LECHE: Extract<ConsultProductOutcome, { kind: "consulted" }> = {
  kind: "consulted",
  product_id: "leche",
  name: "Almendras: leche vegetal 1 l",
  sale_unit: "UNIT",
  unit_price: 430_000,
  promotion: null,
  weight_thousandths: null,
  amount: 430_000,
  stock_thousandths: 14_000,
};

const PERSON: ProductConsultationScreenProps["person"] = {
  user_id: "u1",
  first_name: "Lucas",
  abilities: ["open_cash_session"],
};

const REGISTER_STATUS: RegisterStatusData = {
  person: PERSON,
  registerName: "Caja 1",
  cashSession: { status: "none" },
  status: {
    status: "loaded",
    value: {
      conditions: [],
      cloud: "reachable",
      serial_devices: { scale: "matching", reader: "matching" },
      serial_devices_setup_offered: false,
      contingency: null,
    },
    refreshing: false,
  },
  backupTickets: { status: "loading" },
  onDiscardBackupTickets: () => {},
};

const FIELD_NAME = "Producto";

type Overrides = Partial<ProductConsultationScreenProps>;

export async function renderScreen(overrides: Overrides = {}) {
  await page.viewport(1366, 768);
  onTestFinished(() => page.viewport(414, 896));
  const consultProduct =
    overrides.consultProduct ??
    vi.fn(async (_product: ProductToConsult): Promise<ConsultProductOutcome> => ALMENDRAS);
  const searchProducts =
    overrides.searchProducts ??
    vi.fn(
      async (): Promise<SearchProductsOutcome> => ({
        kind: "results",
        products: [],
        more: false,
      }),
    );
  const readers = new Set<(code: string) => void>();
  const screen = await render(
    <RegisterStatusProvider value={REGISTER_STATUS}>
      <BarcodeReadings
        onBarcodeRead={(listener) => {
          readers.add(listener);
          return () => {
            readers.delete(listener);
          };
        }}
      >
        <ProductConsultationScreen
          sessionId="session-1"
          person={overrides.person ?? PERSON}
          lock={overrides.lock ?? (() => {})}
          currentSale={overrides.currentSale ?? (async () => SALE_OF_YERBA_AND_ALFAJOR)}
          paymentMethodAvailability={overrides.paymentMethodAvailability ?? (async () => AVAILABLE)}
          consultProduct={consultProduct}
          searchProducts={searchProducts}
          productId={"productId" in overrides ? overrides.productId : "almendras"}
          onSessionInvalid={overrides.onSessionInvalid ?? (() => {})}
        />
      </BarcodeReadings>
    </RegisterStatusProvider>,
  );
  return {
    screen,
    field: screen.getByRole("combobox", { name: FIELD_NAME }),
    consultProduct,
    searchProducts,
    readBarcode(code: string) {
      for (const listener of readers) listener(code);
    },
  };
}
