import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import type { CategorySummary } from "./categoriesApi";
import { messages } from "./messages";
import { ProductsListScreen, type ProductsListScreenServices } from "./ProductsListScreen";
import type { GenerateInternalBarcodeOutcome, ProductSummary } from "./productsApi";

// The default viewport is narrower than the modal's own "standard" width, and a modal panel is
// centered by a fixed-position overlay that never grows the document's own scroll area, so a
// control past its clipped edge can't be scrolled into view (see Modal.test.tsx's own reasoning).
// This screen targets the backoffice's desktop-only display, so every test here runs at a
// desktop-sized viewport instead.
beforeEach(async () => {
  await page.viewport(1280, 900);
});

function createServices(
  overrides: Partial<ProductsListScreenServices> = {},
): ProductsListScreenServices {
  return {
    fetchProducts: vi.fn(),
    createProduct: vi.fn(),
    editProduct: vi.fn(),
    deactivateProduct: vi.fn(),
    fetchCategories: vi.fn(),
    generateInternalBarcode: vi.fn(),
    printLabels: vi.fn(),
    ...overrides,
  };
}

const almacen: CategorySummary = { id: "category-1", name: "Almacén", version: 1 };
const frutosSecos: CategorySummary = { id: "category-2", name: "Frutos secos", version: 1 };

const miel: ProductSummary = {
  id: "product-1",
  name: "Miel pura de abeja 1 kg",
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  barcodes: ["7790987000015"],
  active: true,
  version: 1,
};

const almendras: ProductSummary = {
  id: "product-2",
  name: "Almendras peladas",
  categoryId: "category-2",
  categoryName: "Frutos secos",
  saleUnit: "KG",
  barcodes: ["7790000000001"],
  active: true,
  version: 1,
};

type Screen = Awaited<ReturnType<typeof renderScreen>>;
type ScreenLocator = ReturnType<Screen["getByRole"]>;

// The "radio" accessibility role resolves to react-aria's own visually hidden native <input>; the
// visible, clickable surface is the <label> that wraps it (see OptionCardGroup.test.tsx's own
// radioCard helper for the same reasoning).
function radioLabel(dialog: ScreenLocator, title: string): HTMLElement {
  const input = dialog.getByRole("radio", { name: title }).element() as HTMLInputElement;
  const label = input.closest("label");
  if (!label) {
    throw new Error(`no label found for radio "${title}"`);
  }
  return label;
}

function mockLoaded(
  services: ProductsListScreenServices,
  products: ProductSummary[],
  categories: CategorySummary[] = [almacen, frutosSecos],
) {
  vi.mocked(services.fetchProducts).mockResolvedValue({ kind: "ok", value: products });
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: categories });
}

function renderScreen(services: ProductsListScreenServices, onSessionEnded: () => void = () => {}) {
  return render(
    <main>
      <ProductsListScreen services={services} onSessionEnded={onSessionEnded} />
    </main>,
  );
}

test("shows the breadcrumb, heading, each product's data and the product count", async () => {
  const services = createServices();
  mockLoaded(services, [miel, almendras]);

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Catálogo")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Productos", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "Por unidad" })).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "Por peso" })).toBeVisible();
  await expect.element(screen.getByText("2 productos activos")).toBeVisible();
});

test("the search field filters by name or barcode, case-insensitively", async () => {
  const services = createServices();
  mockLoaded(services, [miel, almendras]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 productos activos")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar por nombre o código de barras"), "7790000");
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(screen.getByText("Miel pura de abeja 1 kg").query()).toBeNull();

  await userEvent.fill(screen.getByPlaceholder("Buscar por nombre o código de barras"), "MIEL");
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(screen.getByText("Almendras peladas").query()).toBeNull();
});

test("the category filter narrows the list", async () => {
  const services = createServices();
  mockLoaded(services, [miel, almendras]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 productos activos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Categoría: Todas" }));
  await userEvent.click(screen.getByRole("option", { name: "Frutos secos" }));

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(screen.getByText("Miel pura de abeja 1 kg").query()).toBeNull();
});

test("the unit filter narrows the list", async () => {
  const services = createServices();
  mockLoaded(services, [miel, almendras]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 productos activos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Unidad: Todas" }));
  await userEvent.click(screen.getByRole("option", { name: "Por peso" }));

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(screen.getByText("Miel pura de abeja 1 kg").query()).toBeNull();
});

test("the status filter defaults to active products and refetches with the selected status", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(services.fetchProducts).toHaveBeenLastCalledWith("active");

  const inactiveAlmendras: ProductSummary = { ...almendras, active: false };
  vi.mocked(services.fetchProducts).mockResolvedValueOnce({
    kind: "ok",
    value: [inactiveAlmendras],
  });
  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Inactivos" }));

  expect(services.fetchProducts).toHaveBeenLastCalledWith("inactive");
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
});

test("shows an Estado column with an Activo or Inactivo tag", async () => {
  const services = createServices();
  const inactiveAlmendras: ProductSummary = { ...almendras, active: false };
  mockLoaded(services, [miel, inactiveAlmendras]);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("cell", { name: "Activo" })).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "Inactivo" })).toBeVisible();
});

test("the actions column offers the ban action only on an active row", async () => {
  const services = createServices();
  const inactiveAlmendras: ProductSummary = { ...almendras, active: false };
  mockLoaded(services, [miel, inactiveAlmendras]);
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("button", { name: "Editar el producto Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Desactivar el producto Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Editar el producto Almendras peladas" }))
    .toBeVisible();
  expect(
    screen.getByRole("button", { name: "Desactivar el producto Almendras peladas" }).query(),
  ).toBeNull();
});

test("shows a blank empty state naming active products when there are none", async () => {
  const services = createServices();
  mockLoaded(services, []);

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();
  await expect.element(screen.getByText("Creá uno para verlo en la lista.")).toBeVisible();
});

test("shows an empty state naming inactive products, with no create prompt, when there are none", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "ok", value: [] });
  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Inactivos" }));

  await expect.element(screen.getByText("No hay productos inactivos")).toBeVisible();
  expect(screen.getByText(/Creá/).query()).toBeNull();
});

test("shows the no-products-yet empty state when every status is listed and there are none", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));

  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();
  await expect.element(screen.getByText("Creá el primero para verlo en la lista.")).toBeVisible();
});

test("shows a filtered empty state when the search matches nothing", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar por nombre o código de barras"), "zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("shows a load error with a retry action when the products fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "failed" });
  vi.mocked(services.fetchCategories).mockResolvedValueOnce({ kind: "ok", value: [] });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir los productos")).toBeVisible();

  mockLoaded(services, [miel]);
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("1 producto activo")).toBeVisible();
});

test("shows the rate-limited notice with a retry action", async () => {
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("navigates to Mi cuenta when the products request comes back forbidden", async () => {
  window.history.pushState(null, "", "/catalog/products");
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValue({ kind: "forbidden" });
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("ends the session when the products request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValue({ kind: "unauthenticated" });
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

async function openNewProductModal(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await userEvent.click(screen.getByRole("button", { name: "Nuevo producto" }));
  return screen.getByRole("dialog");
}

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
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Pasta de maní 380 g")).toBeVisible();
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

test("the row action opens the edit modal pre-filled with the product's data", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  await userEvent.click(
    screen.getByRole("button", { name: "Editar el producto Miel pura de abeja 1 kg" }),
  );

  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Miel pura de abeja 1 kg");
  await expect.element(dialog.getByRole("radio", { name: "Por unidad" })).toBeChecked();
  await expect.element(dialog.getByText("7790987000015")).toBeVisible();
});

test("edits a product and shows the updated data in the list", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  const updated: ProductSummary = { ...miel, name: "Miel pura de abeja 500 g", version: 2 };
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok", value: updated });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Editar el producto Miel pura de abeja 1 kg" }),
  );
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre/ }),
    "Miel pura de abeja 500 g",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith("product-1", {
    name: "Miel pura de abeja 500 g",
    categoryId: "category-1",
    saleUnit: "UNIT",
    barcodes: ["7790987000015"],
    version: 1,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Miel pura de abeja 500 g")).toBeVisible();
});

test("shows a stale-version conflict banner, and reloading restores the fresh product before saving again", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Editar el producto Miel pura de abeja 1 kg" }),
  );
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre/ }),
    "Miel pura de abeja 500 g",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Otra persona cambió este producto")).toBeVisible();
  expect(dialog.getByRole("button", { name: "Guardar los cambios" }).query()).toBeNull();

  const freshened: ProductSummary = { ...miel, name: "Miel pura de abeja 900 g", version: 2 };
  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "ok", value: [freshened] });
  vi.mocked(services.editProduct).mockResolvedValueOnce({
    kind: "ok",
    value: { ...freshened, name: "Miel pura de abeja 1200 g", version: 3 },
  });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar el producto" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Miel pura de abeja 900 g");
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre/ }),
    "Miel pura de abeja 1200 g",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  expect(services.editProduct).toHaveBeenLastCalledWith("product-1", {
    name: "Miel pura de abeja 1200 g",
    categoryId: "category-1",
    saleUnit: "UNIT",
    barcodes: ["7790987000015"],
    version: 2,
  });
});

test("has no accessibility violations once loaded, and with the create modal open", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 producto activo")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openNewProductModal(screen);
  await expectNoAccessibilityViolations(document.body);
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  await openEditProductModal(screen, miel);
  await expectNoAccessibilityViolations(document.body);
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  await openDeactivateProductModal(screen, miel);
  await expectNoAccessibilityViolations(document.body);
});

async function fillNewProductFieldsExceptBarcodes(dialog: ScreenLocator) {
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Producto nuevo");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por unidad"));
}

async function openEditProductModal(screen: Screen, product: ProductSummary) {
  await expect.element(screen.getByText(product.name)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: `Editar el producto ${product.name}` }));
  return screen.getByRole("dialog");
}

async function openDeactivateProductModal(screen: Screen, product: ProductSummary) {
  await expect.element(screen.getByText(product.name)).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: `Desactivar el producto ${product.name}` }),
  );
  return screen.getByRole("dialog");
}

test("opens the deactivate confirmation modal, and cancel closes it without calling the API", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  const screen = await renderScreen(services);

  const dialog = await openDeactivateProductModal(screen, miel);
  await expect
    .element(dialog.getByRole("heading", { name: "¿Desactivar Miel pura de abeja 1 kg?" }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Deja de ofrecerse en el catálogo y en las cajas. Las ventas que ya lo incluyen no cambian.",
      ),
    )
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.deactivateProduct).not.toHaveBeenCalled();
});

test("deactivates a product, closes the modal, and refreshes the list", async () => {
  const services = createServices();
  mockLoaded(services, [miel, almendras]);
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  const dialog = await openDeactivateProductModal(screen, miel);

  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "ok", value: [almendras] });
  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  expect(services.deactivateProduct).toHaveBeenCalledWith("product-1");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchProducts).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(screen.getByText("Miel pura de abeja 1 kg").query()).toBeNull();
});

test("shows an already-deactivated notice on 404, and updating the list closes the modal", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "not_found" });
  const screen = await renderScreen(services);
  const dialog = await openDeactivateProductModal(screen, miel);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba desactivado");
  expect(dialog.getByRole("button", { name: "Desactivar" }).query()).toBeNull();

  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "ok", value: [] });
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();
});

test("shows a generic failure notice when deactivating fails", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  const dialog = await openDeactivateProductModal(screen, miel);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByText("No se pudo desactivar el producto")).toBeVisible();
});

test("shows the rate-limited notice when deactivating is refused for too many requests", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.deactivateProduct).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 90,
  });
  const screen = await renderScreen(services);
  const dialog = await openDeactivateProductModal(screen, miel);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("navigates to Mi cuenta when deactivating comes back forbidden", async () => {
  window.history.pushState(null, "", "/catalog/products");
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderScreen(services);
  const dialog = await openDeactivateProductModal(screen, miel);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("ends the session when deactivating finds no open session", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  const dialog = await openDeactivateProductModal(screen, miel);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

function scanInputOf(dialog: ScreenLocator) {
  return dialog.getByRole("textbox", { name: "Escanear otro código" });
}

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

test("rejects scanning a code longer than 64 characters, counting each emoji once", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(scanInputOf(dialog), "🌱".repeat(64));
  await userEvent.keyboard("{Enter}");
  await expect
    .element(dialog.getByRole("button", { name: `Quitar el código ${"🌱".repeat(64)}` }))
    .toBeVisible();

  await userEvent.fill(scanInputOf(dialog), "1".repeat(65));
  await userEvent.keyboard("{Enter}");

  await expect
    .element(dialog.getByText("El código de barras puede tener hasta 64 caracteres."))
    .toBeVisible();
  expect(dialog.getByRole("button", { name: /^Quitar el código/ }).elements()).toHaveLength(1);
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

test("draws the Categoría fallback, Unidad de venta and Códigos de barras pseudo-labels at the same size, weight, color, and row gap as the Nombre field's own label", async () => {
  const services = createServices();
  mockLoaded(services, [miel], []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 producto activo")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  const nameLabel = dialog.getByText("Nombre", { exact: true }).element() as HTMLElement;
  const nameLabelStyle = getComputedStyle(nameLabel);
  const nameRowGap = getComputedStyle(nameLabel.parentElement as HTMLElement).rowGap;

  for (const labelText of ["Categoría", "Unidad de venta", "Códigos de barras"]) {
    const pseudoLabel = dialog.getByText(labelText, { exact: true }).element() as HTMLElement;
    const pseudoLabelStyle = getComputedStyle(pseudoLabel);
    expect(pseudoLabelStyle.fontSize).toBe(nameLabelStyle.fontSize);
    expect(pseudoLabelStyle.fontWeight).toBe(nameLabelStyle.fontWeight);
    expect(pseudoLabelStyle.color).toBe(nameLabelStyle.color);
    expect(getComputedStyle(pseudoLabel.parentElement as HTMLElement).rowGap).toBe(nameRowGap);
  }
});

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
  // Lets the late response settle before checking it left no trace.
  await new Promise((resolve) => setTimeout(resolve, 50));

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
  // Lets the late response settle before checking it left no trace.
  await new Promise((resolve) => setTimeout(resolve, 50));

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
  // Outlasts the background transition, so a hover fill would already show.
  await new Promise((resolve) => setTimeout(resolve, 300));

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
  // Lets the late response settle before checking it left no trace.
  await new Promise((resolve) => setTimeout(resolve, 50));

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
  // Lets the late response settle before checking it left no trace.
  await new Promise((resolve) => setTimeout(resolve, 50));

  await expect.element(dialog.getByText("1 etiqueta")).toBeVisible();
});

test("ignores a reload failure that arrives after the modal was closed and opened again", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
  vi.mocked(services.printLabels).mockResolvedValue({ kind: "product_not_found" });
  const screen = await renderScreen(services);
  const { dialog, resolveReload } = await startReloadThenCloseAndReopen(screen, services);

  resolveReload({ kind: "failed" });
  // Lets the late response settle before checking it left no trace.
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(dialog.getByText("No se pudo recargar la lista").query()).toBeNull();
});

test("ignores a print failure that arrives after the modal was closed and opened again", async () => {
  const services = createServices();
  mockLoaded(services, [mielConCodigoInterno]);
  const resolvePrint = pendingPrint(services);
  const screen = await renderScreen(services);
  const dialog = await startPrintThenCloseAndReopen(screen);

  resolvePrint({ kind: "failed" });
  // Lets the late response settle before checking it left no trace.
  await new Promise((resolve) => setTimeout(resolve, 50));

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
