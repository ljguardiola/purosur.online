import type { ProductSummary } from "@purosur/contracts";
import { useState } from "react";
import { vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../../shell/test-support/render-with-router";
import type { LabelPrinterPort } from "../label-printer-port";
import { PrintLabelsModal, type PrintLabelsModalServices } from "../print-labels-modal";
import { almondOil, almonds, honey, vitora } from "./products";

// Both barcodes are valid check-digit values in the GS1 restricted-circulation range.
export const honeyWithInternalBarcode: ProductSummary = {
  ...honey,
  id: "00000020-0000-4000-8000-000000000000",
  barcodes: ["2000000000015"],
  labelCode: "2000000000015",
  labelModules:
    "10100011010001101010011101001110001101010011101010111001011100101110010111001011001101001110101",
};
export const almondsWithInternalBarcode: ProductSummary = {
  ...almonds,
  id: "00000021-0000-4000-8000-000000000000",
  barcodes: ["2000000000022"],
  labelCode: "2000000000022",
  labelModules:
    "10100011010001101010011101001110001101010011101010111001011100101110010111001011011001101100101",
};
export const almondOilWithInternalBarcode: ProductSummary = {
  ...almondOil,
  barcodes: ["2000000000015"],
  labelCode: "2000000000015",
  labelModules: honeyWithInternalBarcode.labelModules,
};
export const withoutInternalBarcode: ProductSummary = {
  ...honey,
  id: "00000022-0000-4000-8000-000000000000",
  name: "Producto sin código interno",
  barcodes: ["7790000000123"],
};

export const labelPrinterPort: LabelPrinterPort = {
  open: async () => {},
  close: async () => {},
  readable: new ReadableStream(),
  writable: new WritableStream(),
};

export function createServices(
  overrides: Partial<PrintLabelsModalServices> = {},
): PrintLabelsModalServices {
  return {
    printLabels: vi.fn(),
    fetchPrinterLabels: vi.fn(),
    labelPrinterAvailable: () => true,
    chooseLabelPrinter: vi.fn(async () => ({ kind: "chosen" as const, port: labelPrinterPort })),
    printOnLabelPrinter: vi.fn(),
    ...overrides,
  };
}

type HarnessProps = {
  products: ProductSummary[];
  reload: () => Promise<ProductSummary[]>;
  onSessionEnded: () => void;
  services: PrintLabelsModalServices;
};

// Stands in for the screen: it opens and closes the modal, and a reload replaces the products.
function Harness({ products: loaded, reload, onSessionEnded, services }: HarnessProps) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState(loaded);
  return (
    <main>
      <button type="button" onClick={() => setOpen(true)}>
        Imprimir etiquetas
      </button>
      <PrintLabelsModal
        open={open}
        onClose={() => setOpen(false)}
        onSessionEnded={onSessionEnded}
        products={products}
        brands={[vitora]}
        onReload={async () => setProducts(await reload())}
        services={services}
      />
    </main>
  );
}

export async function renderModal(
  services: PrintLabelsModalServices,
  {
    products,
    reload = async () => products,
    onSessionEnded = () => {},
  }: {
    products: ProductSummary[];
    reload?: () => Promise<ProductSummary[]>;
    onSessionEnded?: () => void;
  },
) {
  await page.viewport(1280, 900);
  const element = (
    <Harness
      products={products}
      reload={reload}
      onSessionEnded={onSessionEnded}
      services={services}
    />
  );
  const screen = await render(element);
  // Rerendering drives React's async `act()`, which flushes the already-resolved response's
  // continuation before returning.
  return Object.assign(screen, { settle: () => screen.rerender(element) });
}

export type Screen = Awaited<ReturnType<typeof renderModal>>;

export async function openPrintLabelsModal(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Imprimir etiquetas" }));
  return screen.getByRole("dialog");
}
