import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import type { CategorySummary } from "./categoriesApi";
import { ProductsListScreen, type ProductsListScreenServices } from "./ProductsListScreen";
import type { ProductSummary } from "./productsApi";

function createServices(
  overrides: Partial<ProductsListScreenServices> = {},
): ProductsListScreenServices {
  return {
    fetchProducts: vi.fn(),
    createProduct: vi.fn(),
    editProduct: vi.fn(),
    fetchCategories: vi.fn(),
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
  version: 1,
};

const almendras: ProductSummary = {
  id: "product-2",
  name: "Almendras peladas",
  categoryId: "category-2",
  categoryName: "Frutos secos",
  saleUnit: "KG",
  barcodes: ["7790000000001"],
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
  await expect.element(screen.getByText("2 productos")).toBeVisible();
});

test("the search field filters by name or barcode, case-insensitively", async () => {
  const services = createServices();
  mockLoaded(services, [miel, almendras]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 productos")).toBeVisible();

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
  await expect.element(screen.getByText("2 productos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Categoría: Todas" }));
  await userEvent.click(screen.getByRole("option", { name: "Frutos secos" }));

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(screen.getByText("Miel pura de abeja 1 kg").query()).toBeNull();
});

test("the unit filter narrows the list", async () => {
  const services = createServices();
  mockLoaded(services, [miel, almendras]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 productos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Unidad: Todas" }));
  await userEvent.click(screen.getByRole("option", { name: "Por peso" }));

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(screen.getByText("Miel pura de abeja 1 kg").query()).toBeNull();
});

test("shows a blank empty state when there are no products yet", async () => {
  const services = createServices();
  mockLoaded(services, []);

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();
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

  await expect.element(screen.getByText("1 producto")).toBeVisible();
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
  await expect.element(screen.getByText("1 producto")).toBeVisible();

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
    version: 1,
  };
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok", value: created });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

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

test("opens the create modal with neither a category nor a sale unit pre-chosen", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

  const dialog = await openNewProductModal(screen);

  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();
  await expect.element(dialog.getByRole("radio", { name: "Por unidad" })).not.toBeChecked();
  await expect.element(dialog.getByRole("radio", { name: "Por peso" })).not.toBeChecked();
});

test("rejects creating a product without choosing a category, without calling the API", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

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
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

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
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

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
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

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
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

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
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

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
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

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
  await expect.element(screen.getByText("1 producto")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openNewProductModal(screen);
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

function scanInputOf(dialog: ScreenLocator) {
  return dialog.getByRole("textbox", { name: "Escanear otro código" });
}

test("rejects scanning a code with spaces inside it, without adding a chip", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

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
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

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
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

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
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

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
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

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
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

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
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

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

test("the scan input is marked invalid and described by the barcode field's error", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();

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
  await expect.element(screen.getByText("1 producto")).toBeVisible();

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
