import type { ProductSummary } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { ProductsListScreenServices } from "./products-list-services";
import {
  almonds,
  createServices,
  honey,
  mockLoaded,
  renderScreen,
  type Screen,
  settleLateResponse,
} from "./test-support/products-list-screen";

// Both barcodes are valid check-digit values in the GS1 restricted-circulation range.
const honeyWithInternalBarcode: ProductSummary = {
  ...honey,
  id: "product-20",
  barcodes: ["2000000000015"],
};
const almondsWithInternalBarcode: ProductSummary = {
  ...almonds,
  id: "product-21",
  barcodes: ["2000000000022"],
};
const withoutInternalBarcode: ProductSummary = {
  ...honey,
  id: "product-22",
  name: "Producto sin código interno",
  barcodes: ["7790000000123"],
};

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

test("the header button opens the print labels modal", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  const dialog = await openPrintLabelsModal(screen);

  await expect.element(dialog.getByRole("heading", { name: "Imprimir etiquetas" })).toBeVisible();
});

test("lists only products with an internal barcode", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode, withoutInternalBarcode]);
  const screen = await renderScreen(services);

  const dialog = await openPrintLabelsModal(screen);

  await expect.element(dialog.getByText("Miel pura de abeja 1 kg").first()).toBeVisible();
  await expect.element(dialog.getByText("2000000000015")).toBeVisible();
  expect(dialog.getByText("Producto sin código interno").query()).toBeNull();
});

test("does not list an inactive product, even with an internal barcode", async () => {
  const services = createServices();
  const inactiveAlmonds: ProductSummary = { ...almondsWithInternalBarcode, active: false };
  mockLoaded(services, [honeyWithInternalBarcode, inactiveAlmonds]);
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();

  const dialog = await openPrintLabelsModal(screen);

  await expect.element(dialog.getByText("2000000000015")).toBeVisible();
  expect(dialog.getByText("2000000000022").query()).toBeNull();
});

test("reloading the changed product list keeps the screen's own status filter", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_not_found" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));
  await expect.element(screen.getByText("1 producto", { exact: true })).toBeVisible();
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));
  await expect.element(dialog.getByText("La lista de productos cambió")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar la lista" }));

  await expect.poll(() => dialog.getByText("La lista de productos cambió").query()).toBeNull();
  expect(services.fetchProducts).toHaveBeenLastCalledWith("all");
});

test("shows an empty state when no product has an internal barcode", async () => {
  const services = createServices();
  mockLoaded(services, [withoutInternalBarcode]);
  const screen = await renderScreen(services);

  const dialog = await openPrintLabelsModal(screen);

  await expect
    .element(dialog.getByText("No hay productos activos con código interno"))
    .toBeVisible();
  await expect
    .element(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }))
    .toBeDisabled();
});

test("an inactive product's internal code isn't offered, and the empty state asks for an active one", async () => {
  const services = createServices();
  const inactiveAlmonds: ProductSummary = { ...almondsWithInternalBarcode, active: false };
  mockLoaded(services, [inactiveAlmonds, withoutInternalBarcode]);
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();

  const dialog = await openPrintLabelsModal(screen);

  await expect
    .element(dialog.getByText("No hay productos activos con código interno"))
    .toBeVisible();
  await expect
    .element(dialog.getByText("Generá uno desde el formulario de un producto activo."))
    .toBeVisible();
  expect(dialog.getByText("Almendras peladas").query()).toBeNull();
});

test("the stepper increments and decrements between 0 and 999, disabling each bound", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  const screen = await renderScreen(services);
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
  mockLoaded(services, [honeyWithInternalBarcode, almondsWithInternalBarcode]);
  const screen = await renderScreen(services);
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
  mockLoaded(services, [honeyWithInternalBarcode, almondsWithInternalBarcode]);
  const screen = await renderScreen(services);
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
  mockLoaded(services, [honeyWithInternalBarcode]);
  const screen = await renderScreen(services);
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
  mockLoaded(services, [honeyWithInternalBarcode, almondsWithInternalBarcode]);
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
  const screen = await renderScreen(services);
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
  mockLoaded(services, [honeyWithInternalBarcode]);
  vi.mocked(services.printLabels).mockResolvedValue({
    kind: "ok",
    blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
  });
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
  const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const screen = await renderScreen(services);
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
  mockLoaded(services, [honeyWithInternalBarcode]);
  let resolvePrint: (outcome: { kind: "failed" }) => void = () => {};
  vi.mocked(services.printLabels).mockReturnValue(
    new Promise((resolve) => {
      resolvePrint = resolve;
    }),
  );
  const screen = await renderScreen(services);
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
  mockLoaded(services, [honeyWithInternalBarcode]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_not_found" });
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.element(dialog.getByText("La lista de productos cambió")).toBeVisible();
  const reload = dialog.getByRole("button", { name: "Recargar la lista" });
  await expect.element(reload).toBeVisible();

  vi.mocked(services.fetchProducts).mockResolvedValueOnce({
    kind: "ok",
    value: [almondsWithInternalBarcode],
  });
  await userEvent.click(reload);

  await expect
    .element(dialog.getByText(almondsWithInternalBarcode.barcodes[0] as string))
    .toBeVisible();
  expect(dialog.getByText("La lista de productos cambió").query()).toBeNull();
});

test("shows the products-changed notice on product_without_internal_barcode", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_without_internal_barcode" });
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.element(dialog.getByText("La lista de productos cambió")).toBeVisible();
});

test("shows the rate-limited notice when printing is refused for too many requests", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  vi.mocked(services.printLabels).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 90,
  });
  const screen = await renderScreen(services);
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
  mockLoaded(services, [honeyWithInternalBarcode]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.element(dialog.getByText("No se pudo generar la hoja")).toBeVisible();
});

test("ends the session when printing comes back unauthenticated", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when printing comes back forbidden", async () => {
  window.history.pushState(null, "", "/catalog/products");
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("cancel closes the print labels modal without calling the API", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.printLabels).not.toHaveBeenCalled();
});

test("disables the print labels button while the products are still loading", async () => {
  const services = createServices();
  vi.mocked(services.fetchProducts).mockReturnValue(new Promise(() => {}));
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Imprimir etiquetas" })).toBeDisabled();
});

test("disables the print labels button when the products fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValue({ kind: "failed" });
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir los productos")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Imprimir etiquetas" })).toBeDisabled();
});

test("disables the print labels button while loading the products is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Imprimir etiquetas" })).toBeDisabled();
});

test("caps the sheet at 2400 labels in total, disabling a row's + once the total is reached", async () => {
  const walnutsWithInternalBarcode: ProductSummary = {
    ...almonds,
    id: "product-23",
    name: "Nueces mariposa",
    barcodes: ["2912345678906"],
  };
  const services = createServices();
  mockLoaded(services, [
    honeyWithInternalBarcode,
    almondsWithInternalBarcode,
    walnutsWithInternalBarcode,
  ]);
  const screen = await renderScreen(services);
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

function pendingPrint(services: ProductsListScreenServices) {
  let resolvePrint: (
    outcome: Awaited<ReturnType<ProductsListScreenServices["printLabels"]>>,
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

test("ignores a print success that arrives after the modal was closed and opened again", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  const resolvePrint = pendingPrint(services);
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const screen = await renderScreen(services);
  await startPrintThenCloseAndReopen(screen);

  resolvePrint({ kind: "ok", blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }) });
  await settleLateResponse(screen, services);

  expect(createObjectURL).not.toHaveBeenCalled();
  expect(anchorClick).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog").query()).not.toBeNull();

  createObjectURL.mockRestore();
  anchorClick.mockRestore();
});

async function startReloadThenCloseAndReopen(screen: Screen, services: ProductsListScreenServices) {
  const firstDialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    firstDialog.getByRole("button", {
      name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}`,
    }),
  );
  await userEvent.click(
    firstDialog.getByRole("button", { name: "Descargar la hoja para imprimir" }),
  );
  let resolveReload: (
    outcome: Awaited<ReturnType<ProductsListScreenServices["fetchProducts"]>>,
  ) => void = () => {};
  vi.mocked(services.fetchProducts).mockReturnValueOnce(
    new Promise((resolve) => {
      resolveReload = resolve;
    }),
  );
  await userEvent.click(firstDialog.getByRole("button", { name: "Recargar la lista" }));
  await userEvent.click(firstDialog.getByRole("button", { name: "Cerrar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );
  await expect.element(dialog.getByText("1 etiqueta")).toBeVisible();
  return {
    dialog,
    resolveReload: (outcome: Parameters<typeof resolveReload>[0]) => resolveReload(outcome),
  };
}

test("ignores a reload success that arrives after the modal was closed and opened again", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_not_found" });
  const screen = await renderScreen(services);
  const { dialog, resolveReload } = await startReloadThenCloseAndReopen(screen, services);

  resolveReload({ kind: "ok", value: [honeyWithInternalBarcode] });
  await settleLateResponse(screen, services);

  await expect.element(dialog.getByText("1 etiqueta")).toBeVisible();
});

test("a reload that fails leaves the list failed, with its retry, instead of the print modal", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_not_found" });
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));
  await expect.element(dialog.getByText("La lista de productos cambió")).toBeVisible();

  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "failed" });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar la lista" }));

  await expect.element(screen.getByText("No pudimos abrir los productos")).toBeVisible();
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("the print modal a failed reload closed stays closed once the list loads again", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_not_found" });
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${honeyWithInternalBarcode.name}` }),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));
  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "failed" });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar la lista" }));
  await expect.element(screen.getByText("No pudimos abrir los productos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(
      screen.getByRole("table", { name: "Productos" }).getByText(honeyWithInternalBarcode.name),
    )
    .toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("ignores a print failure that arrives after the modal was closed and opened again", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  const resolvePrint = pendingPrint(services);
  const screen = await renderScreen(services);
  const dialog = await startPrintThenCloseAndReopen(screen);

  resolvePrint({ kind: "failed" });
  await settleLateResponse(screen, services);

  expect(dialog.getByText("No se pudo generar la hoja").query()).toBeNull();
});

test("has no accessibility violations with the print labels modal open, loaded and empty", async () => {
  const services = createServices();
  mockLoaded(services, [honeyWithInternalBarcode]);
  const screen = await renderScreen(services);
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
  mockLoaded(emptyServices, [withoutInternalBarcode]);
  const emptyScreen = await renderScreen(emptyServices);
  const emptyDialog = await openPrintLabelsModal(emptyScreen);
  await expect
    .element(emptyDialog.getByText("No hay productos activos con código interno"))
    .toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});
