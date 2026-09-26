import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { messages } from "./messages";
import type { ProductsListScreenServices } from "./ProductsListScreen";
import type { ProductSummary } from "./productsApi";
import {
  almendras,
  createServices,
  miel,
  mockLoaded,
  renderScreen,
  type Screen,
  settleLateResponse,
} from "./test-support/productsListScreen";

// "2000000000015" is the internal-barcode sample used in the label design's own proof; the
// second code is another valid check-digit code in the same restricted-circulation range.
const mielConCodigoInterno: ProductSummary = {
  ...miel,
  id: "product-20",
  barcodes: ["2000000000015"],
};
const almendrasConCodigoInterno: ProductSummary = {
  ...almendras,
  id: "product-21",
  barcodes: ["2000000000022"],
};
const sinCodigoInterno: ProductSummary = {
  ...miel,
  id: "product-22",
  name: "Producto sin código interno",
  barcodes: ["7790000000123"],
};

async function openPrintLabelsModal(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Imprimir etiquetas" }));
  return screen.getByRole("dialog");
}

test("the header button opens the print labels modal", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  const dialog = await openPrintLabelsModal(screen);

  await expect.element(dialog.getByRole("heading", { name: "Imprimir etiquetas" })).toBeVisible();
});

test("lists only products with an internal barcode", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno, sinCodigoInterno]);
  const screen = await renderScreen(services);

  const dialog = await openPrintLabelsModal(screen);

  // The single labelable product's own name is repeated by the preview card below, so its code
  // (not grouped there the same way) is what proves the row itself is listed.
  await expect.element(dialog.getByText("Miel pura de abeja 1 kg").first()).toBeVisible();
  await expect.element(dialog.getByText("2000000000015")).toBeVisible();
  expect(dialog.getByText("Producto sin código interno").query()).toBeNull();
});

test("does not list an inactive product, even with an internal barcode", async () => {
  const services = createServices();
  const inactiveAlmendras: ProductSummary = { ...almendrasConCodigoInterno, active: false };
  mockLoaded(services, [mielConCodigoInterno, inactiveAlmendras]);
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
  mockLoaded(services, [mielConCodigoInterno]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_not_found" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));
  await expect.element(screen.getByText("1 producto", { exact: true })).toBeVisible();
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));
  await expect.element(dialog.getByText("La lista de productos cambió")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar la lista" }));

  await expect.poll(() => dialog.getByText("La lista de productos cambió").query()).toBeNull();
  expect(services.fetchProducts).toHaveBeenLastCalledWith("all");
});

test("shows an empty state when no product has an internal barcode", async () => {
  const services = createServices();
  mockLoaded(services, [sinCodigoInterno]);
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
  const inactiveAlmendras: ProductSummary = { ...almendrasConCodigoInterno, active: false };
  mockLoaded(services, [inactiveAlmendras, sinCodigoInterno]);
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
  mockLoaded(services, [mielConCodigoInterno]);
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  const decrease = dialog.getByRole("button", {
    name: `Restar una etiqueta de ${mielConCodigoInterno.name}`,
  });
  const increase = dialog.getByRole("button", {
    name: `Sumar una etiqueta a ${mielConCodigoInterno.name}`,
  });
  await expect.element(decrease).toBeDisabled();

  await userEvent.click(increase);
  await expect.element(decrease).toBeEnabled();
  await expect.element(dialog.getByText("1", { exact: true })).toBeVisible();

  await userEvent.click(decrease);
  await expect.element(decrease).toBeDisabled();

  // Reaching the 999 upper bound one click at a time through userEvent would drive the same
  // number of real pointer interactions; a direct native click still goes through the same
  // handler (react-aria's usePress falls back to the "click" event), so the loop stays fast
  // without weakening what it proves.
  for (let clickIndex = 0; clickIndex < 999; clickIndex += 1) {
    (increase.element() as HTMLButtonElement).click();
  }
  await expect.poll(() => dialog.getByText("999", { exact: true }).query()).not.toBeNull();
  await expect.element(increase).toBeDisabled();

  (increase.element() as HTMLButtonElement).click();
  await expect.poll(() => dialog.getByText("999", { exact: true }).query()).not.toBeNull();
});

test("totals and pluralizes the summary as counts change", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno, almendrasConCodigoInterno]);
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);

  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
  );
  await expect.element(dialog.getByText("1 etiqueta")).toBeVisible();

  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${almendrasConCodigoInterno.name}` }),
  );
  await expect.element(dialog.getByText("2 etiquetas")).toBeVisible();
});

test("previews the first product with a count above zero, defaulting to the first row", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno, almendrasConCodigoInterno]);
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  const preview = dialog.getByRole("group", { name: "Vista previa de la etiqueta" });
  // Sorted by name, "Almendras peladas" comes first and is the default preview while every
  // count is still 0.
  await expect.element(preview.getByText(almendrasConCodigoInterno.name)).toBeVisible();

  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
  );

  await expect.element(preview.getByText(mielConCodigoInterno.name)).toBeVisible();
  expect(preview.getByText(almendrasConCodigoInterno.name).query()).toBeNull();
});

test("the download action is disabled while the total is zero", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);

  await expect
    .element(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }))
    .toBeDisabled();

  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
  );

  await expect
    .element(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }))
    .toBeEnabled();
});

test("downloads only the products with a count above zero, then closes the modal", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno, almendrasConCodigoInterno]);
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
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.poll(() => vi.mocked(services.printLabels).mock.calls.length).toBe(1);
  expect(services.printLabels).toHaveBeenCalledWith([
    { productId: mielConCodigoInterno.id, count: 1 },
  ]);
  expect(createObjectURL).toHaveBeenCalledTimes(1);
  expect(anchorClick).toHaveBeenCalledTimes(1);
  expect(downloadedFileNames).toEqual([
    messages.catalog.products.printLabelsModal.downloadFileName,
  ]);
  expect(downloadedFileNames[0]).toMatch(/\.pdf$/);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  createObjectURL.mockRestore();
  revokeObjectURL.mockRestore();
  anchorClick.mockRestore();
});

test("revokes the downloaded sheet's object URL only a minute after the download starts", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
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
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
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
  mockLoaded(services, [mielConCodigoInterno]);
  let resolvePrint: (outcome: { kind: "failed" }) => void = () => {};
  vi.mocked(services.printLabels).mockReturnValue(
    new Promise((resolve) => {
      resolvePrint = resolve;
    }),
  );
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
  );
  const download = dialog.getByRole("button", { name: "Descargar la hoja para imprimir" });

  await userEvent.click(download);

  await expect.element(download).toBeDisabled();
  resolvePrint({ kind: "failed" });
  await expect.element(dialog.getByText("No se pudo generar la hoja")).toBeVisible();
});

test("shows the products-changed notice and offers a reload on product_not_found", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_not_found" });
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.element(dialog.getByText("La lista de productos cambió")).toBeVisible();
  const reload = dialog.getByRole("button", { name: "Recargar la lista" });
  await expect.element(reload).toBeVisible();

  vi.mocked(services.fetchProducts).mockResolvedValueOnce({
    kind: "ok",
    value: [almendrasConCodigoInterno],
  });
  await userEvent.click(reload);

  // The reloaded row's own code (unlike its name, not repeated by the preview card's grouped
  // "2 000000 000022" digits) uniquely identifies it as listed again.
  await expect
    .element(dialog.getByText(almendrasConCodigoInterno.barcodes[0] as string))
    .toBeVisible();
  expect(dialog.getByText("La lista de productos cambió").query()).toBeNull();
});

test("shows the products-changed notice on product_without_internal_barcode", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_without_internal_barcode" });
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.element(dialog.getByText("La lista de productos cambió")).toBeVisible();
});

test("shows the rate-limited notice when printing is refused for too many requests", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
  vi.mocked(services.printLabels).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 90,
  });
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows a generic failure notice when printing fails", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.element(dialog.getByText("No se pudo generar la hoja")).toBeVisible();
});

test("ends the session when printing comes back unauthenticated", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when printing comes back forbidden", async () => {
  window.history.pushState(null, "", "/catalog/products");
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
  );

  await userEvent.click(dialog.getByRole("button", { name: "Descargar la hoja para imprimir" }));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("cancel closes the print labels modal without calling the API", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
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
  const nuecesConCodigoInterno: ProductSummary = {
    ...almendras,
    id: "product-23",
    name: "Nueces mariposa",
    barcodes: ["2912345678906"],
  };
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno, almendrasConCodigoInterno, nuecesConCodigoInterno]);
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  const increase = (product: ProductSummary) =>
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${product.name}` });

  // Native clicks for the same reason as the 999-bound stepper test above.
  for (const [product, count] of [
    [mielConCodigoInterno, 999],
    [almendrasConCodigoInterno, 999],
    [nuecesConCodigoInterno, 402],
  ] as const) {
    for (let clickIndex = 0; clickIndex < count; clickIndex += 1) {
      (increase(product).element() as HTMLButtonElement).click();
    }
  }

  await expect.element(dialog.getByText("2400 etiquetas")).toBeVisible();
  await expect.element(dialog.getByText("402", { exact: true })).toBeVisible();
  await expect.element(increase(nuecesConCodigoInterno)).toBeDisabled();

  (increase(nuecesConCodigoInterno).element() as HTMLButtonElement).click();
  await expect.element(dialog.getByText("2400 etiquetas")).toBeVisible();

  await userEvent.click(
    dialog.getByRole("button", { name: `Restar una etiqueta de ${nuecesConCodigoInterno.name}` }),
  );
  await expect.element(increase(nuecesConCodigoInterno)).toBeEnabled();
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
    firstDialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
  );
  await userEvent.click(
    firstDialog.getByRole("button", { name: "Descargar la hoja para imprimir" }),
  );
  await userEvent.click(firstDialog.getByRole("button", { name: "Cerrar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  const dialog = await openPrintLabelsModal(screen);
  await expect.element(dialog.getByText(mielConCodigoInterno.barcodes[0] as string)).toBeVisible();
  return dialog;
}

test("ignores a print success that arrives after the modal was closed and opened again", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
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
    firstDialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
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
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
  );
  await expect.element(dialog.getByText("1 etiqueta")).toBeVisible();
  return {
    dialog,
    resolveReload: (outcome: Parameters<typeof resolveReload>[0]) => resolveReload(outcome),
  };
}

test("ignores a reload success that arrives after the modal was closed and opened again", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_not_found" });
  const screen = await renderScreen(services);
  const { dialog, resolveReload } = await startReloadThenCloseAndReopen(screen, services);

  resolveReload({ kind: "ok", value: [mielConCodigoInterno] });
  await settleLateResponse(screen, services);

  await expect.element(dialog.getByText("1 etiqueta")).toBeVisible();
});

test("ignores a reload failure that arrives after the modal was closed and opened again", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_not_found" });
  const screen = await renderScreen(services);
  const { dialog, resolveReload } = await startReloadThenCloseAndReopen(screen, services);

  resolveReload({ kind: "failed" });
  await settleLateResponse(screen, services);

  expect(dialog.getByText("No se pudo recargar la lista").query()).toBeNull();
});

test("ignores a print failure that arrives after the modal was closed and opened again", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
  const resolvePrint = pendingPrint(services);
  const screen = await renderScreen(services);
  const dialog = await startPrintThenCloseAndReopen(screen);

  resolvePrint({ kind: "failed" });
  await settleLateResponse(screen, services);

  expect(dialog.getByText("No se pudo generar la hoja").query()).toBeNull();
});

test("has no accessibility violations with the print labels modal open, loaded and empty", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
  const screen = await renderScreen(services);
  const dialog = await openPrintLabelsModal(screen);
  await expect.element(dialog.getByText(mielConCodigoInterno.barcodes[0] as string)).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await userEvent.click(
    dialog.getByRole("button", { name: `Sumar una etiqueta a ${mielConCodigoInterno.name}` }),
  );
  await expectNoAccessibilityViolations(document.body);
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await screen.unmount();

  const emptyServices = createServices();
  mockLoaded(emptyServices, [sinCodigoInterno]);
  const emptyScreen = await renderScreen(emptyServices);
  const emptyDialog = await openPrintLabelsModal(emptyScreen);
  await expect
    .element(emptyDialog.getByText("No hay productos activos con código interno"))
    .toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});
