import { expect, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CategorySummary } from "../categoriesApi";
import { ProductsListScreen, type ProductsListScreenServices } from "../ProductsListScreen";
import type { ProductSummary } from "../productsApi";

export function createServices(
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

export const almacen: CategorySummary = {
  id: "category-1",
  name: "Almacén",
  version: 1,
  parentId: null,
};
export const frutosSecos: CategorySummary = {
  id: "category-2",
  name: "Frutos secos",
  version: 1,
  parentId: null,
};

export const miel: ProductSummary = {
  id: "product-1",
  name: "Miel pura de abeja 1 kg",
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  barcodes: ["7790987000015"],
  netContent: null,
  active: true,
  version: 1,
};

export const almendras: ProductSummary = {
  id: "product-2",
  name: "Almendras peladas",
  categoryId: "category-2",
  categoryName: "Frutos secos",
  saleUnit: "KG",
  barcodes: ["7790000000001"],
  netContent: null,
  active: true,
  version: 1,
};

export type Screen = Awaited<ReturnType<typeof renderScreen>>;
export type ScreenLocator = ReturnType<Screen["getByRole"]>;

// The "radio" accessibility role resolves to react-aria's own visually hidden native <input>; the
// visible, clickable surface is the <label> that wraps it (see OptionCardGroup.test.tsx's own
// radioCard helper for the same reasoning).
export function radioLabel(dialog: ScreenLocator, title: string): HTMLElement {
  const input = dialog.getByRole("radio", { name: title }).element() as HTMLInputElement;
  const label = input.closest("label");
  if (!label) {
    throw new Error(`no label found for radio "${title}"`);
  }
  return label;
}

export function mockLoaded(
  services: ProductsListScreenServices,
  products: ProductSummary[],
  categories: CategorySummary[] = [almacen, frutosSecos],
) {
  vi.mocked(services.fetchProducts).mockResolvedValue({ kind: "ok", value: products });
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: categories });
}

// The default viewport is narrower than the modal's own "standard" width, and a modal panel is
// centered by a fixed-position overlay that never grows the document's own scroll area, so a
// control past its clipped edge can't be scrolled into view (see Modal.test.tsx's own reasoning).
// This screen targets the backoffice's desktop-only display, so every test renders it at a
// desktop-sized viewport instead.
export async function renderScreen(
  services: ProductsListScreenServices,
  onSessionEnded: () => void = () => {},
) {
  await page.viewport(1280, 900);
  return render(
    <main>
      <ProductsListScreen services={services} onSessionEnded={onSessionEnded} />
    </main>,
  );
}

export async function openNewProductModal(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Nuevo producto" }));
  return screen.getByRole("dialog");
}

export async function fillNewProductFieldsExceptBarcodes(dialog: ScreenLocator) {
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Producto nuevo");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por unidad"));
}

export async function openEditProductModal(screen: Screen, product: ProductSummary) {
  await expect.element(screen.getByText(product.name)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: `Editar el producto ${product.name}` }));
  return screen.getByRole("dialog");
}

export async function openDeactivateProductModal(screen: Screen, product: ProductSummary) {
  await expect.element(screen.getByText(product.name)).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: `Desactivar el producto ${product.name}` }),
  );
  return screen.getByRole("dialog");
}

export function scanInputOf(dialog: ScreenLocator) {
  return dialog.getByRole("textbox", { name: "Escanear otro código" });
}

/**
 * Lets a late response's own guarded continuation run to completion, and React commit whatever it
 * would set, before asserting it didn't. Rerendering the same screen goes through React's async
 * `act()`, which yields at least one macrotask before returning and keeps flushing until no update
 * is left queued: the response the test already resolved runs in that yield however many `await`s
 * deep its continuation is, and any state it sets commits inside the same `act()`.
 */
export async function settleLateResponse(
  screen: Screen,
  services: ProductsListScreenServices,
): Promise<void> {
  await screen.rerender(
    <main>
      <ProductsListScreen services={services} onSessionEnded={() => {}} />
    </main>,
  );
}
