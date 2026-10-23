import type {
  FindDeferredSaleOutcome,
  PrintDeferredSaleInvoiceOutcome,
  ReprintSaleReceiptOutcome,
  SignInUser,
} from "@purosur/contracts";
import { onTestFinished, vi } from "vitest";
import { page } from "vitest/browser";
import { BarcodeReadings } from "../../shell/barcode-readings";
import { render } from "../../shell/test-support/render-with-router";
import type { DeferredSaleScreenProps } from "../deferred-sale-screen";
import { DeferredSaleScreen } from "../deferred-sale-screen";

export const QR_TEXT = "purosur-deferred-sale:0198-abc:7KQ4M2P9";

export const FOUND_PENDING: Extract<FindDeferredSaleOutcome, { kind: "found" }> = {
  kind: "found",
  sale_id: "sale-1",
  occurred_at: "2026-09-16T10:20:00.000-03:00",
  total: 329_999,
  short_code: "7KQ4M2P9",
  invoice: { kind: "pending" },
  original_printed: false,
};

export const FOUND_ISSUED: Extract<FindDeferredSaleOutcome, { kind: "found" }> = {
  ...FOUND_PENDING,
  invoice: { kind: "issued", point_of_sale: 3, number: 1250 },
};

const CASHIER: DeferredSaleScreenProps["person"] = {
  user_id: "u1",
  first_name: "Tomás",
  abilities: ["invoice_deferred_sale", "reprint_receipt"],
};

type Overrides = Partial<Omit<DeferredSaleScreenProps, "registerName">>;

export async function renderScreen(overrides: Overrides = {}) {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const findDeferredSale =
    overrides.findDeferredSale ??
    vi.fn(async (): Promise<FindDeferredSaleOutcome> => ({ kind: "not_found" }));
  const printDeferredSaleInvoice =
    overrides.printDeferredSaleInvoice ??
    vi.fn(
      async (): Promise<PrintDeferredSaleInvoiceOutcome> => ({
        kind: "started",
        copy: { kind: "original" },
      }),
    );
  const reprintDeferredSaleInvoice =
    overrides.reprintDeferredSaleInvoice ??
    vi.fn(
      async (): Promise<ReprintSaleReceiptOutcome> => ({
        kind: "started",
        copy: { kind: "duplicate", order_number: 1 },
      }),
    );
  const authorizers: SignInUser[] = [{ id: "u2", first_name: "Grace" }];
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
      <DeferredSaleScreen
        person={overrides.person ?? CASHIER}
        registerName="Caja 1"
        sessionOpen={overrides.sessionOpen ?? true}
        lock={overrides.lock ?? (() => {})}
        findDeferredSale={findDeferredSale}
        printDeferredSaleInvoice={printDeferredSaleInvoice}
        reprintDeferredSaleInvoice={reprintDeferredSaleInvoice}
        loadAuthorizers={overrides.loadAuthorizers ?? (async () => authorizers)}
        onSessionInvalid={onSessionInvalid}
      />
    </BarcodeReadings>,
  );
  return {
    screen,
    codeField: screen.getByRole("textbox", { name: "Código de consulta" }),
    findDeferredSale,
    printDeferredSaleInvoice,
    reprintDeferredSaleInvoice,
    onSessionInvalid,
    readBarcode(code: string) {
      for (const listener of readers) listener(code);
    },
  };
}
