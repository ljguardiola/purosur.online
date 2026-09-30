import type { DiscountSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expect, vi } from "vitest";
import { render } from "../../shell/test-support/render-with-router";
import { DiscountsListScreen } from "../discounts-list-screen";
import type { DiscountsListScreenServices } from "../discounts-list-services";
import { type DiscountsListFilters, discountsListFilters } from "../routes";
import {
  almacenCategory,
  almondsProduct,
  discountList,
  retiredProduct,
  retiredTag,
  sinTaccTag,
  veganoTag,
  yerbaProduct,
  yerbasCategory,
} from "./discounts";

const DATA_COLUMN_COUNT = 5;

const TODAY = () => new Date("2026-09-30T15:00:00.000Z");

export function createServices(
  overrides: Partial<DiscountsListScreenServices> = {},
): DiscountsListScreenServices {
  return {
    fetchDiscounts: vi.fn(),
    fetchProducts: vi.fn().mockResolvedValue({
      kind: "ok",
      value: [yerbaProduct, almondsProduct, retiredProduct],
    }),
    fetchCategories: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: [almacenCategory, yerbasCategory] }),
    fetchTags: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { tags: [sinTaccTag, veganoTag, retiredTag], taggedProductCount: 5 },
    }),
    createDiscount: vi.fn(),
    editDiscount: vi.fn(),
    ...overrides,
  };
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

type ScreenOptions = {
  filters?: DiscountsListFilters;
  onFiltersChange?: (filters: DiscountsListFilters) => void;
  now?: () => Date;
  onSessionEnded?: () => void;
};

function screenElement(
  services: DiscountsListScreenServices,
  {
    filters = discountsListFilters.parse({}),
    onFiltersChange = () => {},
    now = TODAY,
    onSessionEnded = () => {},
  }: ScreenOptions = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <DiscountsListScreen
          services={services}
          onSessionEnded={onSessionEnded}
          filters={filters}
          onFiltersChange={onFiltersChange}
          now={now}
        />
      </main>
    </FieldSizeProvider>
  );
}

export function renderScreen(services: DiscountsListScreenServices, options: ScreenOptions = {}) {
  return render(screenElement(services, options));
}

export type Screen = Awaited<ReturnType<typeof renderScreen>>;

export function rowCells(screen: Screen): string[][] {
  return screen
    .getByRole("row")
    .all()
    .slice(1)
    .map((row) =>
      [...row.element().querySelectorAll("td")]
        .slice(0, DATA_COLUMN_COUNT)
        .map((cell) => cell.textContent ?? ""),
    );
}

export async function loaded(
  services: DiscountsListScreenServices,
  discounts: DiscountSummary[],
  options: ScreenOptions = {},
) {
  vi.mocked(services.fetchDiscounts).mockResolvedValue({
    kind: "ok",
    value: discountList(discounts),
  });
  const screen = await renderScreen(services, options);
  await expect.element(screen.getByRole("table", { name: "Promociones" })).toBeVisible();
  return screen;
}
