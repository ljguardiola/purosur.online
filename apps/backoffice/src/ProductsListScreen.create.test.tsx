import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { CategorySummary } from "./categoriesApi";
import type { ProductSummary } from "./productsApi";
import {
  almacen,
  almendras,
  createServices,
  fillNewProductFieldsExceptBarcodes,
  miel,
  mockLoaded,
  openNewProductModal,
  radioLabel,
  renderScreen,
} from "./test-support/productsListScreen";

test("opens the create modal, and cancel closes it without calling the API", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 producto activo")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await expect.element(dialog.getByRole("heading", { name: "Nuevo producto" })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("creates a product and shows it in the list", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const created: ProductSummary = {
    id: "product-3",
    name: "Pasta de maní 380 g",
    categoryId: "category-1",
    categoryName: "Almacén",
    saleUnit: "KG",
    barcodes: ["7790000000099"],
    netContent: null,
    active: true,
    version: 1,
  };
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok", value: created });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Pasta de maní 380 g");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por peso"));
  await userEvent.fill(
    dialog.getByRole("textbox", { name: "Escanear otro código" }),
    "7790000000099",
  );
  await userEvent.keyboard("{Enter}");
  await expect.element(dialog.getByText("7790000000099")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => vi.mocked(services.createProduct).mock.calls.length).toBe(1);
  expect(services.createProduct).toHaveBeenCalledWith({
    name: "Pasta de maní 380 g",
    categoryId: "category-1",
    saleUnit: "KG",
    barcodes: ["7790000000099"],
    netContent: null,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Pasta de maní 380 g")).toBeVisible();
});

test("creates a product with a net content", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const created: ProductSummary = {
    id: "product-3",
    name: "Pasta de maní 380 g",
    categoryId: "category-1",
    categoryName: "Almacén",
    saleUnit: "KG",
    barcodes: ["7790000000099"],
    netContent: { quantity: 1.5, unit: "KG" },
    active: true,
    version: 1,
  };
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok", value: created });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Pasta de maní 380 g");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por peso"));
  await userEvent.fill(dialog.getByRole("textbox", { name: "Contenido neto" }), "1,5");
  await userEvent.click(dialog.getByRole("button", { name: "g Unidad" }));
  await userEvent.click(dialog.getByRole("option", { name: "kg" }));
  await userEvent.fill(
    dialog.getByRole("textbox", { name: "Escanear otro código" }),
    "7790000000099",
  );
  await userEvent.keyboard("{Enter}");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => vi.mocked(services.createProduct).mock.calls.length).toBe(1);
  expect(services.createProduct).toHaveBeenCalledWith({
    name: "Pasta de maní 380 g",
    categoryId: "category-1",
    saleUnit: "KG",
    barcodes: ["7790000000099"],
    netContent: { quantity: 1.5, unit: "KG" },
  });
});

test("rejects an invalid net content quantity, without calling the API", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Producto nuevo");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por unidad"));
  await userEvent.fill(dialog.getByRole("textbox", { name: "Contenido neto" }), "0");
  await userEvent.fill(dialog.getByRole("textbox", { name: "Escanear otro código" }), "12345");
  await userEvent.keyboard("{Enter}");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(dialog.getByText("Ingresá una cantidad mayor que cero, con hasta 3 decimales."))
    .toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("shows the server's net content error inline on create", async () => {
  const services = createServices();
  mockLoaded(services, []);
  vi.mocked(services.createProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "netContentQuantity",
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await userEvent.fill(dialog.getByRole("textbox", { name: "Escanear otro código" }), "12345");
  await userEvent.keyboard("{Enter}");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(dialog.getByText("Ingresá una cantidad mayor que cero, con hasta 3 decimales."))
    .toBeVisible();
});

test("rejects a net content quantity above the maximum, stating the limit, without calling the API", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await userEvent.fill(dialog.getByRole("textbox", { name: "Contenido neto" }), "100001");
  await userEvent.fill(dialog.getByRole("textbox", { name: "Escanear otro código" }), "12345");
  await userEvent.keyboard("{Enter}");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Ingresá una cantidad de hasta 100.000.")).toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("shows the server's rejection of the whole net content inline on create", async () => {
  const services = createServices();
  mockLoaded(services, []);
  vi.mocked(services.createProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "netContent",
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await userEvent.fill(dialog.getByRole("textbox", { name: "Escanear otro código" }), "12345");
  await userEvent.keyboard("{Enter}");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Revisá el contenido neto.")).toBeVisible();
});

test("a product created while only inactive products are listed stays out of the list", async () => {
  const services = createServices();
  const inactiveAlmendras: ProductSummary = { ...almendras, active: false };
  mockLoaded(services, [inactiveAlmendras]);
  const created: ProductSummary = {
    id: "product-3",
    name: "Pasta de maní 380 g",
    categoryId: "category-1",
    categoryName: "Almacén",
    saleUnit: "UNIT",
    barcodes: ["7790000000099"],
    netContent: null,
    active: true,
    version: 1,
  };
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok", value: created });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Inactivos" }));
  await expect.element(screen.getByText("1 producto inactivo")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Pasta de maní 380 g");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por unidad"));
  await userEvent.fill(
    dialog.getByRole("textbox", { name: "Escanear otro código" }),
    "7790000000099",
  );
  await userEvent.keyboard("{Enter}");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("1 producto inactivo")).toBeVisible();
  expect(screen.getByText("Pasta de maní 380 g").query()).toBeNull();
});

test("opens the create modal with neither a category nor a sale unit pre-chosen", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);

  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();
  await expect.element(dialog.getByRole("radio", { name: "Por unidad" })).not.toBeChecked();
  await expect.element(dialog.getByRole("radio", { name: "Por peso" })).not.toBeChecked();
});

test("rejects creating a product without choosing a category, without calling the API", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Producto nuevo");
  await userEvent.click(radioLabel(dialog, "Por unidad"));
  await userEvent.fill(dialog.getByRole("textbox", { name: "Escanear otro código" }), "12345");
  await userEvent.keyboard("{Enter}");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Elegí una categoría.")).toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("rejects creating a product without choosing a sale unit, without calling the API", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Producto nuevo");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.fill(dialog.getByRole("textbox", { name: "Escanear otro código" }), "12345");
  await userEvent.keyboard("{Enter}");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Elegí la unidad de venta.")).toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("shows the name-too-long error on create, without calling the API", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "a".repeat(101));
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(dialog.getByText("El nombre puede tener hasta 100 caracteres."))
    .toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("shows no category selector when there are no categories yet, and still blocks creating without one", async () => {
  const services = createServices();
  mockLoaded(services, [], []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  expect(dialog.getByRole("button", { name: /Categoría/ }).query()).toBeNull();
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Producto nuevo");
  await userEvent.click(radioLabel(dialog, "Por unidad"));
  await userEvent.fill(dialog.getByRole("textbox", { name: "Escanear otro código" }), "12345");
  await userEvent.keyboard("{Enter}");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Elegí una categoría.")).toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("rejects creating a product without a barcode, without calling the API", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Producto nuevo");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por unidad"));

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Escaneá al menos un código de barras.")).toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("shows the barcode-taken error on create and does not add the product to the list", async () => {
  const services = createServices();
  mockLoaded(services, []);
  vi.mocked(services.createProduct).mockResolvedValue({
    kind: "barcode_taken",
    codes: ["7790000000099"],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Producto nuevo");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por unidad"));
  await userEvent.fill(
    dialog.getByRole("textbox", { name: "Escanear otro código" }),
    "7790000000099",
  );
  await userEvent.keyboard("{Enter}");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(dialog.getByText("El código 7790000000099 ya es de otro producto."))
    .toBeVisible();
  await expect.element(screen.getByRole("dialog")).toBeVisible();
});

test("shows the category-not-leaf error on create when the chosen category gained a subcategory meanwhile", async () => {
  const services = createServices();
  mockLoaded(services, []);
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "category_not_leaf" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await userEvent.fill(
    dialog.getByRole("textbox", { name: "Escanear otro código" }),
    "7790000000099",
  );
  await userEvent.keyboard("{Enter}");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(dialog.getByText('"Almacén" tiene subcategorías. Elegí una de ellas.'))
    .toBeVisible();
  expect(services.createProduct).toHaveBeenCalledTimes(1);
});

test("the category select only offers leaf categories, labeled by their full path", async () => {
  const untables: CategorySummary = {
    id: "category-3",
    name: "Untables",
    version: 1,
    parentId: "category-1",
  };
  const services = createServices();
  mockLoaded(services, [], [almacen, untables]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));

  await expect.element(dialog.getByRole("option", { name: "Almacén › Untables" })).toBeVisible();
  expect(dialog.getByRole("option", { name: "Almacén" }).query()).toBeNull();
});

test("pressing Enter in the scan input adds the code instead of submitting the form", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(
    dialog.getByRole("textbox", { name: "Escanear otro código" }),
    "7790000000099",
  );
  await userEvent.keyboard("{Enter}");

  await expect.element(dialog.getByText("7790000000099")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Nuevo producto" })).toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("rejects adding an already-listed barcode inline, keeping a single chip", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  const scanInput = dialog.getByRole("textbox", { name: "Escanear otro código" });
  await userEvent.fill(scanInput, "7790000000099");
  await userEvent.keyboard("{Enter}");
  await userEvent.fill(scanInput, "7790000000099");
  await userEvent.keyboard("{Enter}");

  await expect.element(dialog.getByText("Ese código ya está en la lista.")).toBeVisible();
  expect(
    dialog.getByRole("button", { name: "Quitar el código 7790000000099" }).elements(),
  ).toHaveLength(1);
});
