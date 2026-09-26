import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { ProductsListScreenServices } from "./ProductsListScreen";
import type { GenerateInternalBarcodeOutcome, ProductSummary } from "./productsApi";
import {
  almendras,
  createServices,
  fillNewProductFieldsExceptBarcodes,
  miel,
  mockLoaded,
  openEditProductModal,
  openNewProductModal,
  radioLabel,
  renderScreen,
  type ScreenLocator,
  scanInputOf,
  settleLateResponse,
} from "./test-support/productsListScreen";

function generateButtonOf(dialog: ScreenLocator) {
  return dialog.getByRole("button", { name: "Generar código interno" });
}

test("generates an internal code, adds it to the list, and saves the product with it", async () => {
  const services = createServices();
  mockLoaded(services, []);
  vi.mocked(services.generateInternalBarcode).mockResolvedValue({
    kind: "ok",
    code: "2000000000015",
  });
  const created: ProductSummary = {
    id: "product-3",
    name: "Ensalada de fruta 300 g",
    categoryId: "category-1",
    categoryName: "Almacén",
    saleUnit: "KG",
    barcodes: ["2000000000015"],
    netContent: null,
    active: true,
    version: 1,
  };
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok", value: created });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Ensalada de fruta 300 g");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por peso"));

  await userEvent.click(generateButtonOf(dialog));
  await expect.element(dialog.getByText("2000000000015")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => vi.mocked(services.createProduct).mock.calls.length).toBe(1);
  expect(services.createProduct).toHaveBeenCalledWith({
    name: "Ensalada de fruta 300 g",
    categoryId: "category-1",
    saleUnit: "KG",
    barcodes: ["2000000000015"],
    netContent: null,
  });
});

test("generates an internal code from the edit modal and saves it alongside the existing code", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.generateInternalBarcode).mockResolvedValue({
    kind: "ok",
    code: "2000000000015",
  });
  vi.mocked(services.editProduct).mockResolvedValue({
    kind: "ok",
    value: { ...miel, barcodes: [...miel.barcodes, "2000000000015"], version: 2 },
  });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, miel);

  await userEvent.click(generateButtonOf(dialog));
  await expect.element(dialog.getByText("2000000000015")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith("product-1", {
    name: "Miel pura de abeja 1 kg",
    categoryId: "category-1",
    saleUnit: "UNIT",
    barcodes: ["7790987000015", "2000000000015"],
    netContent: null,
    version: 1,
  });
});

test("disables the generate button while its request is pending", async () => {
  const services = createServices();
  mockLoaded(services, []);
  // Resolves with a failure, not a code: an allocated internal code would keep the button
  // disabled for the "already listed" reason instead, which is a separate behavior this test
  // isn't the one covering.
  let resolveGenerate: (outcome: { kind: "failed" }) => void = () => {};
  vi.mocked(services.generateInternalBarcode).mockReturnValue(
    new Promise((resolve) => {
      resolveGenerate = resolve;
    }),
  );
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  const generateButton = generateButtonOf(dialog);
  await expect.element(generateButton).not.toBeDisabled();

  await userEvent.click(generateButton);
  await expect.element(generateButton).toBeDisabled();

  resolveGenerate({ kind: "failed" });
  await expect.element(generateButton).not.toBeDisabled();
});

test("disables generating another internal code once one is already listed, enabling again once it's removed", async () => {
  const services = createServices();
  mockLoaded(services, []);
  vi.mocked(services.generateInternalBarcode).mockResolvedValue({
    kind: "ok",
    code: "2000000000015",
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  const generateButton = generateButtonOf(dialog);
  await expect.element(generateButton).not.toBeDisabled();

  await userEvent.click(generateButton);
  await expect.element(dialog.getByText("2000000000015")).toBeVisible();
  await expect.element(generateButton).toBeDisabled();

  await userEvent.click(dialog.getByRole("button", { name: "Quitar el código 2000000000015" }));

  await expect.element(generateButton).not.toBeDisabled();
});

test("shows an inline error when generating fails, keeping the codes already entered", async () => {
  const services = createServices();
  mockLoaded(services, []);
  vi.mocked(services.generateInternalBarcode).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(scanInputOf(dialog), "7790000000099");
  await userEvent.keyboard("{Enter}");
  await expect.element(dialog.getByText("7790000000099")).toBeVisible();

  await userEvent.click(generateButtonOf(dialog));

  await expect
    .element(dialog.getByText("No se pudo generar el código interno. Probá de nuevo."))
    .toBeVisible();
  await expect.element(dialog.getByText("7790000000099")).toBeVisible();
});

function pendingGenerate(services: ProductsListScreenServices) {
  let resolveGenerate: (outcome: GenerateInternalBarcodeOutcome) => void = () => {};
  vi.mocked(services.generateInternalBarcode).mockReturnValue(
    new Promise((resolve) => {
      resolveGenerate = resolve;
    }),
  );
  return (outcome: GenerateInternalBarcodeOutcome) => resolveGenerate(outcome);
}

test("keeps a code scanned while the internal code is being generated", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const resolveGenerate = pendingGenerate(services);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.click(generateButtonOf(dialog));
  await userEvent.fill(scanInputOf(dialog), "7790000000099");
  await userEvent.keyboard("{Enter}");
  await expect.element(dialog.getByText("7790000000099")).toBeVisible();

  resolveGenerate({ kind: "ok", code: "2000000000015" });

  await expect.element(dialog.getByText("2000000000015")).toBeVisible();
  await expect.element(dialog.getByText("7790000000099")).toBeVisible();
});

test("keeps a code removed while the internal code is being generated out of the list", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  const resolveGenerate = pendingGenerate(services);
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, miel);

  await userEvent.click(generateButtonOf(dialog));
  await userEvent.click(dialog.getByRole("button", { name: "Quitar el código 7790987000015" }));
  await expect.poll(() => dialog.getByText("7790987000015").query()).toBeNull();

  resolveGenerate({ kind: "ok", code: "2000000000015" });

  await expect.element(dialog.getByText("2000000000015")).toBeVisible();
  expect(dialog.getByText("7790987000015").query()).toBeNull();
});

test("drops an internal code that arrives after the create modal was closed and opened again", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const resolveGenerate = pendingGenerate(services);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const firstDialog = await openNewProductModal(screen);
  await userEvent.click(generateButtonOf(firstDialog));
  await userEvent.click(firstDialog.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  const dialog = await openNewProductModal(screen);
  await expect.element(generateButtonOf(dialog)).not.toBeDisabled();

  resolveGenerate({ kind: "ok", code: "2000000000015" });
  await settleLateResponse(screen, services);

  expect(dialog.getByText("2000000000015").query()).toBeNull();
});

test("drops an internal code that arrives after the edit modal moved to another product", async () => {
  const services = createServices();
  mockLoaded(services, [miel, almendras]);
  const resolveGenerate = pendingGenerate(services);
  const screen = await renderScreen(services);

  const firstDialog = await openEditProductModal(screen, miel);
  await userEvent.click(generateButtonOf(firstDialog));
  await userEvent.click(firstDialog.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  const dialog = await openEditProductModal(screen, almendras);
  await expect.element(dialog.getByText("7790000000001")).toBeVisible();

  resolveGenerate({ kind: "ok", code: "2000000000015" });
  await settleLateResponse(screen, services);

  expect(dialog.getByText("2000000000015").query()).toBeNull();
  expect(dialog.getByText("7790987000015").query()).toBeNull();
  await expect.element(dialog.getByText("7790000000001")).toBeVisible();
});

test("shows the 20-code limit instead of generating when the list is already full", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  for (let index = 1; index <= 20; index += 1) {
    await userEvent.fill(scanInputOf(dialog), `code-${index}`);
    await userEvent.keyboard("{Enter}");
  }
  await userEvent.click(generateButtonOf(dialog));

  await expect
    .element(dialog.getByText("El producto puede tener hasta 20 códigos de barras."))
    .toBeVisible();
  expect(services.generateInternalBarcode).not.toHaveBeenCalled();
  expect(dialog.getByRole("button", { name: /^Quitar el código/ }).elements()).toHaveLength(20);
});

test("ends the session when generating finds no open session", async () => {
  const services = createServices();
  mockLoaded(services, []);
  vi.mocked(services.generateInternalBarcode).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.click(generateButtonOf(dialog));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when generating comes back forbidden", async () => {
  window.history.pushState(null, "", "/catalog/products");
  const services = createServices();
  mockLoaded(services, []);
  vi.mocked(services.generateInternalBarcode).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.click(generateButtonOf(dialog));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("describes the generate button with its failure, so a screen reader announces it", async () => {
  const services = createServices();
  mockLoaded(services, []);
  vi.mocked(services.generateInternalBarcode).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.click(generateButtonOf(dialog));

  await expect
    .element(generateButtonOf(dialog))
    .toHaveAccessibleDescription("No se pudo generar el código interno. Probá de nuevo.");
});

test("shows the rate-limited notice when generating is refused for too many requests", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.generateInternalBarcode).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await renderScreen(services);

  const createDialog = await openNewProductModal(screen);
  await userEvent.click(generateButtonOf(createDialog));
  await expect.element(createDialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect
    .element(createDialog.getByText("Se puede volver a intentar en 2 minutos."))
    .toBeVisible();
  expect(
    createDialog.getByText("No se pudo generar el código interno. Probá de nuevo.").query(),
  ).toBeNull();
  await userEvent.click(createDialog.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  const editDialog = await openEditProductModal(screen, miel);
  await userEvent.click(generateButtonOf(editDialog));
  await expect.element(editDialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect
    .element(editDialog.getByText("Se puede volver a intentar en 2 minutos."))
    .toBeVisible();
});

test("rings the whole scan control while its input has keyboard focus", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  const input = scanInputOf(dialog).element() as HTMLInputElement;
  const control = input.parentElement;
  if (!control) {
    throw new Error("the scan input has no enclosing control");
  }
  expect(getComputedStyle(control).outlineStyle).toBe("none");

  input.focus();

  await expect.poll(() => getComputedStyle(control).outlineStyle).toBe("solid");
  expect(getComputedStyle(control).outlineWidth).toBe("3px");
});

test("fills the generate button on hover only while it is enabled", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const resolveGenerate = pendingGenerate(services);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  const generateButton = generateButtonOf(dialog);
  const unfilled = getComputedStyle(generateButton.element()).backgroundColor;
  await userEvent.hover(generateButton);
  await expect
    .poll(() => getComputedStyle(generateButton.element()).backgroundColor)
    .not.toBe(unfilled);

  await userEvent.click(generateButton);
  await expect.element(generateButton).toBeDisabled();
  await userEvent.hover(generateButton);
  // Forces a style recalc so any transition the hover would have started has already been
  // computed, then finishes it outright: a transition starts at its from-value, so reading the
  // color mid-transition (or too soon after it) can't be told apart from one that never started.
  getComputedStyle(generateButton.element()).backgroundColor;
  for (const animation of generateButton.element().getAnimations()) {
    animation.finish();
  }

  expect(getComputedStyle(generateButton.element()).backgroundColor).toBe(unfilled);
  resolveGenerate({ kind: "failed" });
});

test("announces a generate failure as an alert", async () => {
  const services = createServices();
  mockLoaded(services, []);
  vi.mocked(services.generateInternalBarcode).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.click(generateButtonOf(dialog));

  await expect
    .element(dialog.getByRole("alert"))
    .toHaveTextContent("No se pudo generar el código interno. Probá de nuevo.");
});

test("clears the rate-limited notice when generating again succeeds", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.generateInternalBarcode)
    .mockResolvedValueOnce({ kind: "rate_limited", retryAfterSeconds: 120 })
    .mockResolvedValueOnce({ kind: "ok", code: "2000000000015" })
    .mockResolvedValueOnce({ kind: "rate_limited", retryAfterSeconds: 120 })
    .mockResolvedValueOnce({ kind: "ok", code: "2000000000022" });
  const screen = await renderScreen(services);

  const createDialog = await openNewProductModal(screen);
  await userEvent.click(generateButtonOf(createDialog));
  await expect.element(createDialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await userEvent.click(generateButtonOf(createDialog));
  await expect.element(createDialog.getByText("2000000000015")).toBeVisible();
  expect(createDialog.getByText("Demasiadas solicitudes").query()).toBeNull();
  await userEvent.click(createDialog.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  const editDialog = await openEditProductModal(screen, miel);
  await userEvent.click(generateButtonOf(editDialog));
  await expect.element(editDialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await userEvent.click(generateButtonOf(editDialog));
  await expect.element(editDialog.getByText("2000000000022")).toBeVisible();
  expect(editDialog.getByText("Demasiadas solicitudes").query()).toBeNull();
});

test("keeps a rate-limited notice raised by saving when generating afterwards succeeds", async () => {
  const services = createServices();
  mockLoaded(services, []);
  vi.mocked(services.createProduct).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  vi.mocked(services.generateInternalBarcode).mockResolvedValue({
    kind: "ok",
    code: "2000000000015",
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await userEvent.fill(scanInputOf(dialog), "7790000000099");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));
  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();

  await userEvent.click(generateButtonOf(dialog));

  await expect.element(dialog.getByText("2000000000015")).toBeVisible();
  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});
