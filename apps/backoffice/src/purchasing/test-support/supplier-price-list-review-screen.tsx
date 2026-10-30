import type { SupplierPriceListReview } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expect, vi } from "vitest";
import {
  StubCategoryCreationModal,
  StubProductCreationModal,
} from "../../platform/test-support/creation-parts";
import type { BackofficeAccess } from "../../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS } from "../../shell/test-support/backoffice-access";
import { render } from "../../shell/test-support/render-with-router";
import { SupplierPriceListReviewScreen } from "../supplier-price-list-review-screen";
import type { SupplierPriceListReviewScreenServices } from "../supplier-price-list-review-services";
import {
  type SupplierPriceListReviewFilters,
  supplierPriceListReviewFilters,
} from "../supplier-price-lists-filters";
import { READ_LIST } from "./supplier-price-lists";

export const LIST_ID = READ_LIST.id;

export function createServices(
  overrides: Partial<SupplierPriceListReviewScreenServices> = {},
): SupplierPriceListReviewScreenServices {
  return {
    fetchSupplierPriceListReview: vi.fn(),
    setSupplierPriceListRowPrice: vi.fn(),
    removeSupplierPriceListRow: vi.fn(),
    markSupplierPriceListRowReviewed: vi.fn(),
    linkSupplierPriceListRow: vi.fn(),
    fetchSupplierItemLinkProposal: vi.fn().mockReturnValue(new Promise(() => {})),
    fetchSupplierItemLinkChoices: vi.fn().mockReturnValue(new Promise(() => {})),
    createPackaging: vi.fn(),
    createProductFromSupplierItem: vi.fn(),
    fetchProductCreationCategories: vi.fn().mockReturnValue(new Promise(() => {})),
    fetchProductCreationBrands: vi.fn().mockReturnValue(new Promise(() => {})),
    fetchProductCreationTags: vi.fn().mockReturnValue(new Promise(() => {})),
    createBrand: vi.fn(),
    createTag: vi.fn(),
    generateInternalBarcode: vi.fn(),
    confirmSupplierPriceList: vi.fn(),
    discardSupplierPriceList: vi.fn(),
    fetchSupplierPriceListAiCost: vi.fn().mockReturnValue(new Promise(() => {})),
    ...overrides,
  };
}

export function screenElement(
  services: SupplierPriceListReviewScreenServices,
  {
    filters = supplierPriceListReviewFilters.parse({}),
    onFiltersChange = () => {},
    onBack = () => {},
    onSessionEnded = () => {},
    access = ADMINISTRATOR_ACCESS,
  }: {
    access?: BackofficeAccess;
    filters?: SupplierPriceListReviewFilters;
    onFiltersChange?: (filters: SupplierPriceListReviewFilters) => void;
    onBack?: () => void;
    onSessionEnded?: () => void;
  } = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <SupplierPriceListReviewScreen
          listId={LIST_ID}
          access={access}
          categoryCreationModal={StubCategoryCreationModal}
          productCreationModal={StubProductCreationModal}
          services={services}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onBack={onBack}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

export function renderScreen(...args: Parameters<typeof screenElement>) {
  return render(screenElement(...args));
}

export async function loaded(
  services: SupplierPriceListReviewScreenServices,
  review: SupplierPriceListReview,
  options: Parameters<typeof screenElement>[1] = {},
) {
  vi.mocked(services.fetchSupplierPriceListReview).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", review },
  });
  const screen = await renderScreen(services, options);
  await expect.element(screen.getByRole("table", { name: "Ítems de la lista" })).toBeVisible();
  return screen;
}
