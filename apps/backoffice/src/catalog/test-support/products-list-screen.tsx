import type { BrandSummary, CategorySummary, ProductSummary, TagSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expect, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../../shell/test-support/render-with-router";
import { ProductsListScreen } from "../products-list-screen";
import type { ProductsListScreenServices } from "../products-list-services";
import { type ProductsListFilters, productsListFilters } from "../routes";
import { driedFruits, groceries } from "./products";
import { tagList } from "./tags";

export function createServices(
  overrides: Partial<ProductsListScreenServices> = {},
): ProductsListScreenServices {
  return {
    fetchProducts: vi.fn(),
    createProduct: vi.fn(),
    editProduct: vi.fn(),
    deactivateProduct: vi.fn(),
    reactivateProduct: vi.fn(),
    fetchCategories: vi.fn(),
    fetchBrands: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchTags: vi.fn().mockResolvedValue({ kind: "ok", value: tagList([]) }),
    createBrand: vi.fn(),
    createTag: vi.fn(),
    generateInternalBarcode: vi.fn(),
    printLabels: vi.fn(),
    ...overrides,
  };
}

export type Screen = Awaited<ReturnType<typeof renderScreen>>;
export type ScreenLocator = ReturnType<Screen["getByRole"]>;

export function mockLoaded(
  services: ProductsListScreenServices,
  products: ProductSummary[],
  categories: CategorySummary[] = [groceries, driedFruits],
  brands: BrandSummary[] = [],
  tags: TagSummary[] = [],
) {
  vi.mocked(services.fetchProducts).mockResolvedValue({ kind: "ok", value: products });
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: categories });
  vi.mocked(services.fetchBrands).mockResolvedValue({ kind: "ok", value: brands });
  vi.mocked(services.fetchTags).mockResolvedValue({ kind: "ok", value: tagList(tags) });
}

// A modal panel is centered by a fixed-position overlay that never grows the document's scroll
// area, so a control past its clipped edge can't be scrolled into view at the default viewport.
export function screenElement(
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
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ProductsListScreen
          services={services}
          onSessionEnded={onSessionEnded}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      </main>
    </FieldSizeProvider>
  );
}

export async function renderScreen(...args: Parameters<typeof screenElement>) {
  await page.viewport(1280, 900);
  return render(screenElement(...args));
}

export async function openNewProductModal(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Nuevo producto" }));
  return screen.getByRole("dialog");
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

export async function openReactivateProductModal(screen: Screen, product: ProductSummary) {
  await expect.element(screen.getByText(product.name)).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: `Reactivar el producto ${product.name}` }),
  );
  return screen.getByRole("dialog");
}
