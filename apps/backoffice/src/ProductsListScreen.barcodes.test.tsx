import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { ProductSummary } from "./productsApi";
import {
  createServices,
  fillNewProductFieldsExceptBarcodes,
  miel,
  mockLoaded,
  openEditProductModal,
  openNewProductModal,
  renderScreen,
  type ScreenLocator,
  scanInputOf,
} from "./test-support/productsListScreen";

test("rejects scanning a code with spaces inside it, without adding a chip", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(scanInputOf(dialog), "779 0001");
  await userEvent.keyboard("{Enter}");

  await expect
    .element(dialog.getByText("El código de barras no puede tener espacios."))
    .toBeVisible();
  expect(dialog.getByRole("button", { name: /^Quitar el código/ }).query()).toBeNull();
});

test("shows the barcode-too-long error when scanning, without listing the code", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(scanInputOf(dialog), "1".repeat(65));
  await userEvent.keyboard("{Enter}");

  await expect
    .element(dialog.getByText("El código de barras puede tener hasta 64 caracteres."))
    .toBeVisible();
  expect(dialog.getByRole("button", { name: /^Quitar el código/ }).query()).toBeNull();
});

test("refuses scanning more than 20 codes for one product", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  for (let index = 1; index <= 21; index += 1) {
    await userEvent.fill(scanInputOf(dialog), `code-${index}`);
    await userEvent.keyboard("{Enter}");
  }

  await expect
    .element(dialog.getByText("El producto puede tener hasta 20 códigos de barras."))
    .toBeVisible();
  expect(dialog.getByRole("button", { name: /^Quitar el código/ }).elements()).toHaveLength(20);
});

test("shows an invalid-code error, not the required one, when the cloud rejects listed barcodes", async () => {
  const services = createServices();
  mockLoaded(services, []);
  vi.mocked(services.createProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "barcodes",
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await userEvent.fill(scanInputOf(dialog), "7790000000099");
  await userEvent.keyboard("{Enter}");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(dialog.getByText("Alguno de los códigos de barras no es válido."))
    .toBeVisible();
  expect(dialog.getByText("Escaneá al menos un código de barras.").query()).toBeNull();
});

test("shows an invalid-code error on edit when the cloud rejects the listed barcodes", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.editProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "barcodes",
  });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, miel);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText("Alguno de los códigos de barras no es válido."))
    .toBeVisible();
  expect(dialog.getByText("Escaneá al menos un código de barras.").query()).toBeNull();
});

test("creating includes a code typed in the scan input but not yet confirmed with Enter", async () => {
  const services = createServices();
  mockLoaded(services, []);
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await userEvent.fill(scanInputOf(dialog), "7790000000099");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => vi.mocked(services.createProduct).mock.calls.length).toBe(1);
  expect(services.createProduct).toHaveBeenCalledWith({
    name: "Producto nuevo",
    categoryId: "category-1",
    saleUnit: "UNIT",
    barcodes: ["7790000000099"],
    netContent: null,
  });
});

test("creating is blocked when the code left in the scan input is invalid", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await userEvent.fill(scanInputOf(dialog), "779 0001");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(dialog.getByText("El código de barras no puede tener espacios."))
    .toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("saving an edit includes a code typed in the scan input but not yet confirmed with Enter", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, miel);

  await userEvent.fill(scanInputOf(dialog), "7790000000099");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith("product-1", {
    name: "Miel pura de abeja 1 kg",
    categoryId: "category-1",
    saleUnit: "UNIT",
    barcodes: ["7790987000015", "7790000000099"],
    netContent: null,
    version: 1,
  });
});

test("saving an edit is blocked when the code left in the scan input is already listed", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, miel);

  await userEvent.fill(scanInputOf(dialog), "7790987000015");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ese código ya está en la lista.")).toBeVisible();
  expect(services.editProduct).not.toHaveBeenCalled();
});

test("shows a generic barcode-taken error when the cloud names no taken code", async () => {
  const services = createServices();
  mockLoaded(services, []);
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "barcode_taken", codes: [] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await userEvent.fill(scanInputOf(dialog), "7790000000099");
  await userEvent.keyboard("{Enter}");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(dialog.getByText("Alguno de los códigos ya es de otro producto."))
    .toBeVisible();
});

test("shows a generic barcode-taken error on edit when the cloud names no taken code", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "barcode_taken", codes: [] });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, miel);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText("Alguno de los códigos ya es de otro producto."))
    .toBeVisible();
});

test("reloading after a stale-version conflict retitles the modal with the fresh name", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, miel);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Otra persona cambió este producto")).toBeVisible();

  const freshened: ProductSummary = { ...miel, name: "Miel pura de abeja 900 g", version: 2 };
  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "ok", value: [freshened] });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar el producto" }));

  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 900 g" }))
    .toBeVisible();
});

test("reloading an inactive product after a stale-version conflict finds it", async () => {
  const services = createServices();
  const inactiveMiel: ProductSummary = { ...miel, active: false };
  mockLoaded(services, [inactiveMiel]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, inactiveMiel);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Otra persona cambió este producto")).toBeVisible();

  const freshened: ProductSummary = {
    ...inactiveMiel,
    name: "Miel pura de abeja 900 g",
    version: 2,
  };
  vi.mocked(services.fetchProducts).mockImplementation(async (status) =>
    status === "all" ? { kind: "ok", value: [freshened] } : { kind: "ok", value: [] },
  );
  await userEvent.click(dialog.getByRole("button", { name: "Recargar el producto" }));

  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 900 g" }))
    .toBeVisible();
});

test("the scan input is marked invalid and described by the barcode field's error", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await expect.element(scanInputOf(dialog)).not.toHaveAttribute("aria-invalid", "true");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));
  await expect.element(scanInputOf(dialog)).toHaveAttribute("aria-invalid", "true");
  await expect
    .element(scanInputOf(dialog))
    .toHaveAccessibleDescription("Escaneá al menos un código de barras.");

  await userEvent.fill(scanInputOf(dialog), "779 0001");
  await userEvent.keyboard("{Enter}");
  await expect
    .element(scanInputOf(dialog))
    .toHaveAccessibleDescription(/El código de barras no puede tener espacios\./);
});

test("marks the sale unit and barcode labels as required, like the name and category", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 producto activo")).toBeVisible();

  const createDialog = await openNewProductModal(screen);
  for (const labelText of ["Unidad de venta", "Códigos de barras"]) {
    const label = createDialog.getByText(labelText, { exact: true }).element() as HTMLElement;
    expect(getComputedStyle(label, "::after").content).toContain("*");
  }
  await expect
    .element(createDialog.getByRole("radiogroup", { name: "Unidad de venta" }))
    .toHaveAttribute("aria-required", "true");
  await userEvent.click(createDialog.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  const editDialog = await openEditProductModal(screen, miel);
  for (const labelText of ["Unidad de venta", "Códigos de barras"]) {
    const label = editDialog.getByText(labelText, { exact: true }).element() as HTMLElement;
    expect(getComputedStyle(label, "::after").content).toContain("*");
  }
  await expect
    .element(editDialog.getByRole("radiogroup", { name: "Unidad de venta" }))
    .toHaveAttribute("aria-required", "true");
});

test("removing a chip clears the barcode-limit error once the product is back under the limit", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  for (let index = 1; index <= 21; index += 1) {
    await userEvent.fill(scanInputOf(dialog), `code-${index}`);
    await userEvent.keyboard("{Enter}");
  }
  const limitError = dialog.getByText("El producto puede tener hasta 20 códigos de barras.");
  await expect.element(limitError).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Quitar el código code-1" }));

  await expect.poll(() => limitError.query()).toBeNull();
  await expect.element(scanInputOf(dialog)).not.toHaveAttribute("aria-invalid", "true");
});

test("editing the scan input clears the previous scan error", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(scanInputOf(dialog), "779 0001");
  await userEvent.keyboard("{Enter}");
  const spacesError = dialog.getByText("El código de barras no puede tener espacios.");
  await expect.element(spacesError).toBeVisible();

  await userEvent.fill(scanInputOf(dialog), "7790001");

  await expect.poll(() => spacesError.query()).toBeNull();
  await expect.element(scanInputOf(dialog)).not.toHaveAttribute("aria-invalid", "true");
});

test("removing an unrelated chip keeps the error of a code still invalid in the scan input", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(scanInputOf(dialog), "7790001");
  await userEvent.keyboard("{Enter}");
  await userEvent.fill(scanInputOf(dialog), "779 0002");
  await userEvent.keyboard("{Enter}");
  const spacesError = dialog.getByText("El código de barras no puede tener espacios.");
  await expect.element(spacesError).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Quitar el código 7790001" }));

  await expect.element(spacesError).toBeVisible();
  await expect.element(scanInputOf(dialog)).toHaveAttribute("aria-invalid", "true");
});

test("marks the fallback category label as required when there are no categories yet", async () => {
  const services = createServices();
  mockLoaded(services, [miel], []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 producto activo")).toBeVisible();

  const createDialog = await openNewProductModal(screen);
  const createLabel = createDialog.getByText("Categoría", { exact: true }).element() as HTMLElement;
  expect(getComputedStyle(createLabel, "::after").content).toContain("*");
  await userEvent.click(createDialog.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  const editDialog = await openEditProductModal(screen, miel);
  const editLabel = editDialog.getByText("Categoría", { exact: true }).element() as HTMLElement;
  expect(getComputedStyle(editLabel, "::after").content).toContain("*");
});

function scanPlaceholderOf(dialog: ScreenLocator) {
  return dialog.getByText("Escanear otro código", { exact: true });
}

// The modal keeps focus inside itself, so a plain blur() is pulled back into the scan input;
// moving focus to another field is what actually leaves it.
async function moveFocusOutOfScanInput(dialog: ScreenLocator) {
  await userEvent.click(dialog.getByRole("textbox", { name: /^Nombre/ }));
}

test("shows the scan placeholder only while the scan input is empty", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  const input = scanInputOf(dialog).element() as HTMLInputElement;
  await expect.element(scanPlaceholderOf(dialog)).toBeVisible();

  await userEvent.fill(scanInputOf(dialog), "7790001");
  await moveFocusOutOfScanInput(dialog);
  await expect.poll(() => scanPlaceholderOf(dialog).query()).toBeNull();

  input.focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(dialog.getByText("7790001")).toBeVisible();
  await moveFocusOutOfScanInput(dialog);

  await expect.element(scanPlaceholderOf(dialog)).toBeVisible();
});

test("hides the scan placeholder while the empty scan input has focus", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  const input = scanInputOf(dialog).element() as HTMLInputElement;
  await expect.element(scanPlaceholderOf(dialog)).toBeVisible();

  input.focus();
  await expect.poll(() => scanPlaceholderOf(dialog).query()).toBeNull();

  await moveFocusOutOfScanInput(dialog);
  await expect.element(scanPlaceholderOf(dialog)).toBeVisible();
});
