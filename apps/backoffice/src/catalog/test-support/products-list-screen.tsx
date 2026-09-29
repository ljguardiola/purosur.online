import type { CategorySummary, ProductSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expect, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../../shell/test-support/render-with-router";
import { ProductsListScreen } from "../products-list-screen";
import type { ProductsListScreenServices } from "../products-list-services";
import { type ProductsListFilters, productsListFilters } from "../routes";

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

export const groceries: CategorySummary = {
  id: "category-1",
  name: "Almacén",
  version: 1,
  parentId: null,
};
export const driedFruits: CategorySummary = {
  id: "category-2",
  name: "Frutos secos",
  version: 1,
  parentId: null,
};

export const honey: ProductSummary = {
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

export const almonds: ProductSummary = {
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

// The "radio" role resolves to react-aria's own visually hidden native <input>; the visible,
// clickable surface is the <label> that wraps it.
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
  categories: CategorySummary[] = [groceries, driedFruits],
) {
  vi.mocked(services.fetchProducts).mockResolvedValue({ kind: "ok", value: products });
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: categories });
}

// A modal panel is centered by a fixed-position overlay that never grows the document's scroll
// area, so a control past its clipped edge can't be scrolled into view at the default viewport.
export async function renderScreen(
  services: ProductsListScreenServices,
  onSessionEnded: () => void = () => {},
  {
    filters = productsListFilters.parse({}),
    onFiltersChange = () => {},
  }: {
    filters?: ProductsListFilters;
    onFiltersChange?: (filters: ProductsListFilters) => void;
  } = {},
) {
  await page.viewport(1280, 900);
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <ProductsListScreen
          services={services}
          onSessionEnded={onSessionEnded}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      </main>
    </FieldSizeProvider>,
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

/** Rerendering drives React's async `act()`, which flushes the already-resolved response's continuation before returning. */
export async function settleLateResponse(
  screen: Screen,
  services: ProductsListScreenServices,
): Promise<void> {
  await screen.rerender(
    <FieldSizeProvider size="backoffice">
      <main>
        <ProductsListScreen
          services={services}
          onSessionEnded={() => {}}
          filters={productsListFilters.parse({})}
          onFiltersChange={() => {}}
        />
      </main>
    </FieldSizeProvider>,
  );
}
