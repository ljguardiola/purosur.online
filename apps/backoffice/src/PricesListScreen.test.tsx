import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import type { CategorySummary } from "./categoriesApi";
import { PricesListScreen, type PricesListScreenServices } from "./PricesListScreen";
import type { PriceProduct } from "./pricesApi";

const NOW = () => new Date("2026-09-25T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function createServices(
  overrides: Partial<PricesListScreenServices> = {},
): PricesListScreenServices {
  return {
    fetchPrices: vi.fn(),
    setPrice: vi.fn(),
    confirmPrice: vi.fn(),
    fetchCategories: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    ...overrides,
  };
}

const almacen: CategorySummary = { id: "category-1", name: "Almacén", version: 1 };

const sinPrecio: PriceProduct = {
  id: "product-1",
  name: "Fideos",
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "UNIT",
  currentPrice: null,
  lastReviewedAt: null,
};

const arroz: PriceProduct = {
  id: "product-2",
  name: "Arroz",
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "KG",
  currentPrice: {
    id: "price-1",
    unitPrice: 750000,
    validFrom: new Date(NOW().getTime() - 40 * DAY_MS).toISOString(),
  },
  lastReviewedAt: new Date(NOW().getTime() - 40 * DAY_MS).toISOString(),
};

function renderScreen(services: PricesListScreenServices, onSessionEnded: () => void = () => {}) {
  return render(
    <main>
      <PricesListScreen services={services} onSessionEnded={onSessionEnded} now={NOW} />
    </main>,
  );
}

test("shows the breadcrumb, heading, and each product's name", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [sinPrecio, arroz], pendingCount: 2, reviewWindowDays: 30 },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Catálogo")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Precios", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Fideos")).toBeVisible();
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows a no-price product with a Sin precio badge and Nunca, and a priced product's amount and review age", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [sinPrecio, arroz], pendingCount: 2, reviewWindowDays: 30 },
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Fideos")).toBeVisible();

  await expect.element(screen.getByText("Sin precio")).toBeVisible();
  await expect.element(screen.getByText("Nunca")).toBeVisible();
  await expect.element(screen.getByText("$ 7.500,00 / kg")).toBeVisible();
  await expect.element(screen.getByText("Hace 40 días")).toBeVisible();
});

test("offers no confirm-without-change action for a product with no price", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [sinPrecio], pendingCount: 1, reviewWindowDays: 30 },
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Fideos")).toBeVisible();

  expect(
    screen.getByRole("button", { name: "Confirmar el precio de Fideos sin cambios" }).query(),
  ).toBeNull();
  await expect
    .element(screen.getByRole("button", { name: "Cambiar el precio de Fideos" }))
    .toBeVisible();
});

test("confirming a priced product's price without a change shows a confirmed notice and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30 },
    })
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [], pendingCount: 0, reviewWindowDays: 30 },
    });
  vi.mocked(services.confirmPrice).mockResolvedValue({
    kind: "ok",
    value: { lastReviewedAt: "2026-09-25T12:00:00.000Z" },
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
  );

  expect(services.confirmPrice).toHaveBeenCalledWith("product-2", {
    expectedCurrentPriceId: "price-1",
  });
  await expect.element(screen.getByText("Precio confirmado")).toBeVisible();
  await expect.element(screen.getByText("Arroz sigue a $ 7.500,00 / kg.")).toBeVisible();
  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.length)
    .toBeGreaterThanOrEqual(2);
});

test("changing a product's price sends the current price id as expectedCurrentPriceId, shows a saved notice and refreshes", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30 },
    })
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [], pendingCount: 0, reviewWindowDays: 30 },
    });
  vi.mocked(services.setPrice).mockResolvedValue({
    kind: "ok",
    value: {
      price: { id: "price-2", unitPrice: 800000, validFrom: "2026-09-25T12:00:00.000Z" },
      lastReviewedAt: "2026-09-25T12:00:00.000Z",
    },
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));
  await expect.element(screen.getByRole("heading", { name: "Arroz" })).toBeVisible();

  await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));

  expect(services.setPrice).toHaveBeenCalledWith("product-2", {
    unitPrice: 800000,
    expectedCurrentPriceId: "price-1",
  });
  await expect.element(screen.getByText("Precio actualizado")).toBeVisible();
  await expect.element(screen.getByText("Arroz pasa a $ 8.000,00 / kg.")).toBeVisible();
});

test("shows a validation error for an empty or zero new price without calling the server", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30 },
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));

  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));
  await expect.element(screen.getByText("Ingresá el precio nuevo.")).toBeVisible();

  await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "0");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));
  await expect.element(screen.getByText("Ingresá un precio válido, mayor a cero.")).toBeVisible();

  expect(services.setPrice).not.toHaveBeenCalled();
});

test("shows a stale-price notice on a 409 and offers to reload the row's current price", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30 },
    })
    .mockResolvedValueOnce({
      kind: "ok",
      value: {
        products: [
          {
            ...arroz,
            currentPrice: {
              id: "price-9",
              unitPrice: 900000,
              validFrom: "2026-09-25T00:00:00.000Z",
            },
          },
        ],
        pendingCount: 1,
        reviewWindowDays: 30,
      },
    });
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "stale_price" });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));
  await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.element(screen.getByText("Este precio cambió mientras lo mirabas")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Recargar el precio" })).toBeVisible();
});

test("shows the empty state when nothing is pending review", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [], pendingCount: 0, reviewWindowDays: 30 },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Precios al día")).toBeVisible();
  await expect
    .element(screen.getByText("Todos los precios se revisaron en los últimos 30 días."))
    .toBeVisible();
  expect(screen.getByRole("button", { name: /Revisar/ }).query()).toBeNull();
});

test("the search field re-fetches with the typed search term", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30 },
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar un producto"), "arr");

  await expect
    .poll(() =>
      vi
        .mocked(services.fetchPrices)
        .mock.calls.some((call) => call[0].search === "arr" && call[0].review === "pending"),
    )
    .toBe(true);
});

test("the review filter switches between pending and all, re-fetching each time", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz, sinPrecio], pendingCount: 2, reviewWindowDays: 30 },
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Revisión: Por revisar" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));

  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.some((call) => call[0].review === "all"))
    .toBe(true);
});

test("the category filter narrows the request by categoryId", async () => {
  const services = createServices({
    fetchCategories: vi.fn().mockResolvedValue({ kind: "ok", value: [almacen] }),
  });
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30 },
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Categoría: Todas" }));
  await userEvent.click(screen.getByRole("option", { name: "Almacén" }));

  await expect
    .poll(() =>
      vi
        .mocked(services.fetchPrices)
        .mock.calls.some((call) => call[0].categoryId === "category-1"),
    )
    .toBe(true);
});

test("Revisar los N walks the pending products one by one, opening the next after each save", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockImplementation(async () => ({
    kind: "ok",
    value: { products: [sinPrecio, arroz], pendingCount: 2, reviewWindowDays: 30 },
  }));
  vi.mocked(services.setPrice).mockResolvedValue({
    kind: "ok",
    value: {
      price: { id: "price-3", unitPrice: 100, validFrom: "2026-09-25T12:00:00.000Z" },
      lastReviewedAt: "2026-09-25T12:00:00.000Z",
    },
  });
  vi.mocked(services.confirmPrice).mockResolvedValue({
    kind: "ok",
    value: { lastReviewedAt: "2026-09-25T12:00:00.000Z" },
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("button", { name: "Revisar los 2" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Revisar los 2" }));
  await expect.element(screen.getByRole("heading", { name: "Fideos" })).toBeVisible();

  await userEvent.fill(screen.getByLabelText("Precio de venta por unidad"), "1");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.element(screen.getByRole("heading", { name: "Arroz" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Confirmar sin cambios" }));

  expect(screen.getByRole("heading", { name: "Arroz" }).query()).toBeNull();
});
