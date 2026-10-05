import type { ProductSummary } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { PrintLabelsModal, type PrintLabelsModalServices } from "./print-labels-modal";
import { almonds, honey } from "./test-support/products";

// Both barcodes are valid check-digit values in the GS1 restricted-circulation range.
const honeyWithInternalBarcode: ProductSummary = {
  ...honey,
  id: "00000020-0000-4000-8000-000000000000",
  barcodes: ["2000000000015"],
  labelCode: "2000000000015",
  labelModules:
    "10100011010001101010011101001110001101010011101010111001011100101110010111001011001101001110101",
};
const almondsWithInternalBarcode: ProductSummary = {
  ...almonds,
  id: "00000021-0000-4000-8000-000000000000",
  barcodes: ["2000000000022"],
  labelCode: "2000000000022",
  labelModules:
    "10100011010001101010011101001110001101010011101010111001011100101110010111001011011001101100101",
};
const withoutInternalBarcode: ProductSummary = {
  ...honey,
  id: "00000022-0000-4000-8000-000000000000",
  name: "Producto sin código interno",
  barcodes: ["7790000000123"],
};

function createServices(
  overrides: Partial<PrintLabelsModalServices> = {},
): PrintLabelsModalServices {
  return { printLabels: vi.fn(), ...overrides };
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
        onReload={async () => setProducts(await reload())}
        services={services}
      />
    </main>
  );
}

async function renderModal(
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

type Screen = Awaited<ReturnType<typeof renderModal>>;

async function openPrintLabelsModal(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Imprimir etiquetas" }));
  return screen.getByRole("dialog");
}

// A native click reaches the same handler as userEvent: react-aria's usePress falls back to the
// click event, so repeated clicks below run fast without weakening what they prove.
function clickManyTimesNatively(element: { element: () => Element }, times: number): void {
  for (let clickIndex = 0; clickIndex < times; clickIndex += 1) {
    (element.element() as HTMLButtonElement).click();
  }
}

function pendingPrint(services: PrintLabelsModalServices) {
  let resolvePrint: (
    outcome: Awaited<ReturnType<PrintLabelsModalServices["printLabels"]>>,
  ) => void = () => {};
  vi.mocked(services.printLabels).mockReturnValue(
    new Promise((resolve) => {
      resolvePrint = resolve;
    }),
  );
  return (outcome: Parameters<typeof resolvePrint>[0]) => resolvePrint(outcome);
}

async function startPrintThenCloseAndReopen(screen: Screen) {
  const firstDialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    firstDialog.getByRole("button", {
      name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}`,
    }),
  );
  await userEvent.click(
    firstDialog.getByRole("button", { name: "Descargar la hoja para imprimir" }),
  );
  await userEvent.click(firstDialog.getByRole("button", { name: "Cerrar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  const dialog = await openPrintLabelsModal(screen);
  await expect
    .element(dialog.getByText(honeyWithInternalBarcode.barcodes[0] as string))
    .toBeVisible();
  return dialog;
}

async function startReloadThenCloseAndReopen(screen: Screen) {
  const firstDialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    firstDialog.getByRole("button", {
      name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}`,
    }),
  );
  await userEvent.click(
    firstDialog.getByRole("button", { name: "Descargar la hoja para imprimir" }),
  );
  await userEvent.click(firstDialog.getByRole("button", { name: "Recargar la lista" }));
  await userEvent.click(firstDialog.getByRole("button", { name: "Cerrar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );
  await expect.element(dialog.getByText("1 etiqueta")).toBeVisible();
  return dialog;
}

test("lists only products with an internal barcode", async () => {
  const services = createServices();
  const screen = await renderModal(services, {
    products: [honeyWithInternalBarcode, withoutInternalBarcode],
  });

  const dialog = await openPrintLabelsModal(screen);

  await expect.element(dialog.getByText("Miel pura de abeja 1 kg").first()).toBeVisible();
  await expect.element(dialog.getByText("2000000000015")).toBeVisible();
  expect(dialog.getByText("Producto sin código interno").query()).toBeNull();
});

test("lists each product by the label code the cloud sends, not by its barcodes", async () => {
  const services = createServices();
  const withoutLabelCode: ProductSummary = {
    ...almondsWithInternalBarcode,
    name: "Producto sin etiqueta",
    labelCode: null,
    labelModules: null,
  };
  const screen = await renderModal(services, {
    products: [
      {
        ...honeyWithInternalBarcode,
        labelCode: "2000000000039",
        labelModules:
          "10100011010001101010011101001110001101010011101010111001011100101110010111001010000101110100101",
      },
      withoutLabelCode,
    ],
  });

  const dialog = await openPrintLabelsModal(screen);

  await expect.element(dialog.getByText("2000000000039")).toBeVisible();
  expect(dialog.getByText("2000000000015").query()).toBeNull();
  expect(dialog.getByText("Producto sin etiqueta").query()).toBeNull();
});

test("lists the products alphabetically by name", async () => {
  const services = createServices();
  const screen = await renderModal(services, {
    products: [honeyWithInternalBarcode, almondsWithInternalBarcode],
  });

  const dialog = await openPrintLabelsModal(screen);

  await expect
    .poll(() =>
      dialog
        .getByRole("button", { name: /^Sumar una etiqueta a / })
        .all()
        .map((button) => button.element().getAttribute("aria-label")),
    )
    .toEqual([
      `Sumar una etiqueta a ${almondsWithInternalBarcode.name}`,
      `Sumar una etiqueta a ${honeyWithInternalBarcode.name}`,
    ]);
});

test("shows only the empty state when no product has an internal barcode", async () => {
  const services = createServices();
  const screen = await renderModal(services, { products: [withoutInternalBarcode] });

  const dialog = await openPrintLabelsModal(screen);

  await expect
    .element(dialog.getByText("No hay productos activos con código interno"))
    .toBeVisible();
  expect(dialog.getByText(/Elegí cuántas etiquetas/).query()).toBeNull();
  await expect
    .element(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }))
    .toBeDisabled();
});

test("the empty state asks to generate a code from an active product's form", async () => {
  const services = createServices();
  const screen = await renderModal(services, { products: [withoutInternalBarcode] });

  const dialog = await openPrintLabelsModal(screen);

  await expect
    .element(dialog.getByText("Generá uno desde el formulario de un producto activo."))
    .toBeVisible();
});

test("the stepper increments and decrements between 0 and 999, disabling each bound", async () => {
  const services = createServices();
  const screen = await renderModal(services, { products: [honeyWithInternalBarcode] });
  const dialog = await openPrintLabelsModal(screen);
  const decrease = dialog.getByRole("button", {
    name: `Restar una etiqueta de ${honeyWithInternalBarcode.name}`,
  });
  const increase = dialog.getByRole("button", {
    name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}`,
  });
  await expect.element(decrease).toBeDisabled();

  await userEvent.click(increase);
  await expect.element(decrease).toBeEnabled();
  await expect.element(dialog.getByText("1", { exact: true })).toBeVisible();

  await userEvent.click(decrease);
  await expect.element(decrease).toBeDisabled();

  clickManyTimesNatively(increase, 999);
  await expect.poll(() => dialog.getByText("999", { exact: true }).query()).not.toBeNull();
  await expect.element(increase).toBeDisabled();

  (increase.element() as HTMLButtonElement).click();
  await expect.poll(() => dialog.getByText("999", { exact: true }).query()).not.toBeNull();
});

test("totals and pluralizes the summary as counts change", async () => {
  const services = createServices();
  const screen = await renderModal(services, {
    products: [honeyWithInternalBarcode, almondsWithInternalBarcode],
  });
  const dialog = await openPrintLabelsModal(screen);

  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );
  await expect.element(dialog.getByText("1 etiqueta")).toBeVisible();

  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${almondsWithInternalBarcode.name}` }),
  );
  await expect.element(dialog.getByText("2 etiquetas")).toBeVisible();
});

test("previews the first product with a count above zero, defaulting to the first row", async () => {
  const services = createServices();
  const screen = await renderModal(services, {
    products: [honeyWithInternalBarcode, almondsWithInternalBarcode],
  });
  const dialog = await openPrintLabelsModal(screen);
  const preview = dialog.getByRole("group", { name: "Vista previa de la etiqueta" });
  await expect.element(preview.getByText(almondsWithInternalBarcode.name)).toBeVisible();

  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );

  await expect.element(preview.getByText(honeyWithInternalBarcode.name)).toBeVisible();
  expect(preview.getByText(almondsWithInternalBarcode.name).query()).toBeNull();
});

test("the download action is disabled while the total is zero", async () => {
  const services = createServices();
  const screen = await renderModal(services, { products: [honeyWithInternalBarcode] });
  const dialog = await openPrintLabelsModal(screen);

  await expect
    .element(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }))
    .toBeDisabled();

  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );

  await expect
    .element(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }))
    .toBeEnabled();
});

test("downloads only the products with a count above zero, then closes the modal", async () => {
  const services = createServices();
  vi.mocked(services.printLabels).mockResolvedValue({
    kind: "ok",
    blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
  });
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
  const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const downloadedFileNames: string[] = [];
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadedFileNames.push(this.download);
  });
  const screen = await renderModal(services, {
    products: [honeyWithInternalBarcode, almondsWithInternalBarcode],
  });
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.poll(() => vi.mocked(services.printLabels).mock.calls.length).toBe(1);
  expect(services.printLabels).toHaveBeenCalledWith([
    { productId: honeyWithInternalBarcode.id, count: 1 },
  ]);
  expect(createObjectURL).toHaveBeenCalledTimes(1);
  expect(anchorClick).toHaveBeenCalledTimes(1);
  expect(downloadedFileNames).toEqual(["etiquetas.pdf"]);
  expect(downloadedFileNames[0]).toMatch(/\.pdf$/);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  createObjectURL.mockRestore();
  revokeObjectURL.mockRestore();
  anchorClick.mockRestore();
});

test("revokes the downloaded sheet's object URL only a minute after the download starts", async () => {
  const services = createServices();
  vi.mocked(services.printLabels).mockResolvedValue({
    kind: "ok",
    blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
  });
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
  const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const screen = await renderModal(services, { products: [honeyWithInternalBarcode] });
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );

  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));
    await expect.poll(() => anchorClick.mock.calls.length).toBe(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(59_000);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  } finally {
    vi.useRealTimers();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    anchorClick.mockRestore();
  }
});

test("the download action is disabled while the request is pending", async () => {
  const services = createServices();
  let resolvePrint: (outcome: { kind: "failed" }) => void = () => {};
  vi.mocked(services.printLabels).mockReturnValue(
    new Promise((resolve) => {
      resolvePrint = resolve;
    }),
  );
  const screen = await renderModal(services, { products: [honeyWithInternalBarcode] });
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );
  const download = dialog.getByRole("button", { name: "Descargar la hoja para imprimir" });

  await userEvent.click(download);

  await expect.element(download).toBeDisabled();
  resolvePrint({ kind: "failed" });
  await expect.element(dialog.getByText("No se pudo generar la hoja")).toBeVisible();
});

test("shows the products-changed notice and offers a reload on product_not_found", async () => {
  const services = createServices();
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_not_found" });
  const screen = await renderModal(services, {
    products: [honeyWithInternalBarcode],
    reload: async () => [almondsWithInternalBarcode],
  });
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.element(dialog.getByText("La lista de productos cambió")).toBeVisible();
  const reload = dialog.getByRole("button", { name: "Recargar la lista" });
  await expect.element(reload).toBeVisible();

  await userEvent.click(reload);

  await expect
    .element(dialog.getByText(almondsWithInternalBarcode.barcodes[0] as string))
    .toBeVisible();
  expect(dialog.getByText("La lista de productos cambió").query()).toBeNull();
});

test("shows the products-changed notice on product_without_internal_barcode", async () => {
  const services = createServices();
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_without_internal_barcode" });
  const screen = await renderModal(services, { products: [honeyWithInternalBarcode] });
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.element(dialog.getByText("La lista de productos cambió")).toBeVisible();
});

test("shows the rate-limited notice when printing is refused for too many requests", async () => {
  const services = createServices();
  vi.mocked(services.printLabels).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 90,
  });
  const screen = await renderModal(services, { products: [honeyWithInternalBarcode] });
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows a generic failure notice when printing fails", async () => {
  const services = createServices();
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "failed" });
  const screen = await renderModal(services, { products: [honeyWithInternalBarcode] });
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.element(dialog.getByText("No se pudo generar la hoja")).toBeVisible();
});

test("ends the session when printing comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal(services, {
    products: [honeyWithInternalBarcode],
    onSessionEnded: onSessionEnded,
  });
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when printing comes back forbidden", async () => {
  window.history.pushState(null, "", "/products");
  const services = createServices();
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal(services, { products: [honeyWithInternalBarcode] });
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});

test("cancel closes the print labels modal without calling the API", async () => {
  const services = createServices();
  const screen = await renderModal(services, { products: [honeyWithInternalBarcode] });
  const dialog = await openPrintLabelsModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.printLabels).not.toHaveBeenCalled();
});

test("draws the preview's bars from the modules the cloud sends", async () => {
  const services = createServices();
  const screen = await renderModal(services, {
    products: [{ ...honeyWithInternalBarcode, labelModules: "1011" }],
  });

  const dialog = await openPrintLabelsModal(screen);

  const preview = dialog.getByRole("group", { name: "Vista previa de la etiqueta" });
  await expect.element(preview).toBeVisible();
  const svg = preview.element().querySelector("svg");
  expect(svg?.getAttribute("viewBox")).toBe("0 0 4 40");
  expect([...(svg?.querySelectorAll("rect") ?? [])].map((rect) => rect.getAttribute("x"))).toEqual([
    "0",
    "2",
  ]);
});

test("caps the sheet at 2400 labels in total, disabling a row's + once the total is reached", async () => {
  const walnutsWithInternalBarcode: ProductSummary = {
    ...almonds,
    id: "00000023-0000-4000-8000-000000000000",
    name: "Nueces mariposa",
    barcodes: ["2912345678906"],
    labelCode: "2912345678906",
    labelModules:
      "10100010110011001001101101000010100011011100101010101000010001001001000111010011100101010000101",
  };
  const services = createServices();
  const screen = await renderModal(services, {
    products: [honeyWithInternalBarcode, almondsWithInternalBarcode, walnutsWithInternalBarcode],
  });
  const dialog = await openPrintLabelsModal(screen);
  const increase = (product: ProductSummary) =>
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${product.name}` });

  for (const [product, count] of [
    [honeyWithInternalBarcode, 999],
    [almondsWithInternalBarcode, 999],
    [walnutsWithInternalBarcode, 402],
  ] as const) {
    clickManyTimesNatively(increase(product), count);
  }

  await expect.element(dialog.getByText("2400 etiquetas")).toBeVisible();
  await expect.element(dialog.getByText("402", { exact: true })).toBeVisible();
  await expect.element(increase(walnutsWithInternalBarcode)).toBeDisabled();

  (increase(walnutsWithInternalBarcode).element() as HTMLButtonElement).click();
  await expect.element(dialog.getByText("2400 etiquetas")).toBeVisible();

  await userEvent.click(
    dialog.getByRole("button", {
      name: `Restar una etiqueta de ${walnutsWithInternalBarcode.name}`,
    }),
  );
  await expect.element(increase(walnutsWithInternalBarcode)).toBeEnabled();
});

test("ignores a print success that arrives after the modal was closed and opened again", async () => {
  const services = createServices();
  const resolvePrint = pendingPrint(services);
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const screen = await renderModal(services, { products: [honeyWithInternalBarcode] });
  await startPrintThenCloseAndReopen(screen);

  resolvePrint({ kind: "ok", blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }) });
  await screen.settle();

  expect(createObjectURL).not.toHaveBeenCalled();
  expect(anchorClick).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog").query()).not.toBeNull();

  createObjectURL.mockRestore();
  anchorClick.mockRestore();
});

test("ignores a reload success that arrives after the modal was closed and opened again", async () => {
  const services = createServices();
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_not_found" });
  let resolveReload: (products: ProductSummary[]) => void = () => {};
  const screen = await renderModal(services, {
    products: [honeyWithInternalBarcode],
    reload: () =>
      new Promise((resolve) => {
        resolveReload = resolve;
      }),
  });
  const dialog = await startReloadThenCloseAndReopen(screen);

  resolveReload([honeyWithInternalBarcode]);
  await screen.settle();

  await expect.element(dialog.getByText("1 etiqueta")).toBeVisible();
});

test("ignores a print failure that arrives after the modal was closed and opened again", async () => {
  const services = createServices();
  const resolvePrint = pendingPrint(services);
  const screen = await renderModal(services, { products: [honeyWithInternalBarcode] });
  const dialog = await startPrintThenCloseAndReopen(screen);

  resolvePrint({ kind: "failed" });
  await screen.settle();

  expect(dialog.getByText("No se pudo generar la hoja").query()).toBeNull();
});

test("has no accessibility violations with the print labels modal open, loaded and empty", async () => {
  const services = createServices();
  const screen = await renderModal(services, { products: [honeyWithInternalBarcode] });
  const dialog = await openPrintLabelsModal(screen);
  await expect
    .element(dialog.getByText(honeyWithInternalBarcode.barcodes[0] as string))
    .toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );
  await expectNoAccessibilityViolations(document.body);
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await screen.unmount();

  const emptyServices = createServices();
  const emptyScreen = await renderModal(emptyServices, { products: [withoutInternalBarcode] });
  const emptyDialog = await openPrintLabelsModal(emptyScreen);
  await expect
    .element(emptyDialog.getByText("No hay productos activos con código interno"))
    .toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});
