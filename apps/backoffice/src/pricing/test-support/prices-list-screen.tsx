import type { PriceCategory, PriceProduct } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expect, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../../shell/test-support/render-with-router";
import { PricesListScreen } from "../prices-list-screen";
import type { PricesListScreenServices } from "../prices-list-services";
import { type PricesListFilters, pricesListFilters } from "../routes";

const NOW = () => new Date("2026-09-25T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

export function createServices(
  overrides: Partial<PricesListScreenServices> = {},
): PricesListScreenServices {
  return {
    fetchPrices: vi.fn(),
    setPrice: vi.fn(),
    confirmPrice: vi.fn(),
    ...overrides,
  };
}

export const groceries: PriceCategory = { id: "category-1", name: "Almacén" };

export const withoutPrice: PriceProduct = {
  id: "product-1",
  name: "Fideos",
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  currentPrice: null,
  daysSinceReview: null,
  pending: true,
};

export const rice: PriceProduct = {
  id: "product-2",
  name: "Arroz",
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "KG",
  currentPrice: {
    id: "00000000-0000-4000-8000-000000000001",
    unitPrice: 750000,
    validFrom: new Date(NOW().getTime() - 40 * DAY_MS).toISOString(),
  },
  daysSinceReview: 40,
  pending: true,
};

export const yerbaMate: PriceProduct = {
  ...rice,
  id: "product-3",
  name: "Yerba",
  currentPrice: {
    id: "00000000-0000-4000-8000-000000000003",
    unitPrice: 300000,
    validFrom: "2026-08-16T12:00:00.000Z",
  },
};

export function screenElement(
  services: PricesListScreenServices,
  onSessionEnded: () => void = () => {},
  {
    filters = pricesListFilters.parse({}),
    onFiltersChange = () => {},
  }: {
    filters?: PricesListFilters;
    onFiltersChange?: (filters: PricesListFilters) => void;
  } = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <PricesListScreen
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
  const screen = screenElement(...args);
  const rendered = await render(screen);
  return Object.assign(rendered, {
    // Flushes pending microtasks, then re-renders inside act so anything they scheduled commits
    // before a later assertion runs.
    commitScheduledUpdates: async () => {
      await nextTask();
      await rendered.rerender(screen);
    },
  });
}

// A MessageChannel task rather than a timer, so it still runs while setTimeout is faked.
function nextTask() {
  return new Promise((settle) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => settle(undefined);
    channel.port2.postMessage(null);
  });
}

export async function openRicePriceModal(services: PricesListScreenServices) {
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [rice],
      pendingCount: 1,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));
  return screen;
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

export function expectRowActionsDisabled(screen: Awaited<ReturnType<typeof renderScreen>>) {
  return Promise.all([
    expect
      .element(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }))
      .toBeDisabled(),
    expect
      .element(screen.getByRole("button", { name: "Cambiar el precio de Yerba" }))
      .toBeDisabled(),
    expect
      .element(screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }))
      .toBeDisabled(),
    expect
      .element(screen.getByRole("button", { name: "Confirmar el precio de Yerba sin cambios" }))
      .toBeDisabled(),
    expect.element(screen.getByRole("button", { name: "Revisar los 2" })).toBeDisabled(),
  ]);
}
