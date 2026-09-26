import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { PricesListScreen, type PricesListScreenServices } from "./PricesListScreen";
import type { PriceCategory, PriceProduct } from "./pricesApi";

const NOW = () => new Date("2026-09-25T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function createServices(
  overrides: Partial<PricesListScreenServices> = {},
): PricesListScreenServices {
  return {
    fetchPrices: vi.fn(),
    setPrice: vi.fn(),
    confirmPrice: vi.fn(),
    ...overrides,
  };
}

const almacen: PriceCategory = { id: "category-1", name: "Almacén" };

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
    value: { products: [sinPrecio, arroz], pendingCount: 2, reviewWindowDays: 30, categories: [] },
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
    value: { products: [sinPrecio, arroz], pendingCount: 2, reviewWindowDays: 30, categories: [] },
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
    value: { products: [sinPrecio], pendingCount: 1, reviewWindowDays: 30, categories: [] },
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
      value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
    })
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [], pendingCount: 0, reviewWindowDays: 30, categories: [] },
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

test("a second click on a row's confirm while the first is in flight sends no second confirmation", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
  });
  vi.mocked(services.confirmPrice).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);
  const confirm = screen.getByRole("button", {
    name: "Confirmar el precio de Arroz sin cambios",
  });
  await expect.element(confirm).toBeVisible();

  await confirm.click();
  await confirm.click({ force: true });

  expect(services.confirmPrice).toHaveBeenCalledTimes(1);
});

test("changing a product's price sends the current price id as expectedCurrentPriceId, shows a saved notice and refreshes", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
    })
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [], pendingCount: 0, reviewWindowDays: 30, categories: [] },
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
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
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

async function openArrozPriceModal(services: PricesListScreenServices) {
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));
  return screen;
}

test("reads a comma as the decimal separator and a dot only as a thousands separator", async () => {
  const services = createServices();
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "failed" });
  const screen = await openArrozPriceModal(services);

  const accepted: [string, number][] = [
    ["7.500,50", 750050],
    ["7500,5", 750050],
    ["12,50", 1250],
    ["1.250", 125000],
    ["1.234.567", 123456700],
    ["8000", 800000],
  ];
  for (const [typed, cents] of accepted) {
    await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), typed);
    await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));
    await expect.poll(() => vi.mocked(services.setPrice).mock.lastCall?.[1].unitPrice).toBe(cents);
  }
});

test("rejects a dot used as a decimal separator, asking for the price written with a comma", async () => {
  const services = createServices();
  const screen = await openArrozPriceModal(services);

  for (const typed of ["12.50", "1.5", "7500.50", "1.50,00", "12,505"]) {
    await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), typed);
    await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));
    await expect
      .element(
        screen.getByText("Escribí el precio con coma para los decimales, por ejemplo 7.500,50."),
      )
      .toBeVisible();
  }

  expect(services.setPrice).not.toHaveBeenCalled();
});

test("rejects a price above the largest one the catalog can store, without calling the server", async () => {
  const services = createServices();
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "failed" });
  const screen = await openArrozPriceModal(services);

  await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "21.474.836,48");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));
  await expect
    .element(screen.getByText("Ingresá un precio de hasta $ 21.474.836,47."))
    .toBeVisible();
  expect(services.setPrice).not.toHaveBeenCalled();

  await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "21.474.836,47");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));
  await expect
    .poll(() => vi.mocked(services.setPrice).mock.lastCall?.[1].unitPrice)
    .toBe(2147483647);
});

test("shows a stale-price notice on a 409 and offers to reload the row's current price", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
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
        categories: [],
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
    value: { products: [], pendingCount: 0, reviewWindowDays: 30, categories: [] },
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
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
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
    value: { products: [arroz, sinPrecio], pendingCount: 2, reviewWindowDays: 30, categories: [] },
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Revisión: Por revisar" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));

  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.some((call) => call[0].review === "all"))
    .toBe(true);
});

test("keeps the previous rows and the Revisar button on screen while the list refreshes", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: {
        products: [arroz, sinPrecio],
        pendingCount: 2,
        reviewWindowDays: 30,
        categories: [],
      },
    })
    .mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Revisión: Por revisar" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));
  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.some((call) => call[0].review === "all"))
    .toBe(true);

  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await expect.element(screen.getByText("Fideos")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Revisar los 2" })).toBeVisible();
});

test("the category filter offers the categories the prices list brings and narrows the request by categoryId", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [almacen] },
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
    value: { products: [sinPrecio, arroz], pendingCount: 2, reviewWindowDays: 30, categories: [] },
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

test("during Revisar los N, a saved price's notice shows inside the next product's modal, naming the saved product, until the modal closes", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockImplementation(async () => ({
    kind: "ok",
    value: { products: [sinPrecio, arroz], pendingCount: 2, reviewWindowDays: 30, categories: [] },
  }));
  vi.mocked(services.setPrice).mockResolvedValue({
    kind: "ok",
    value: {
      price: { id: "price-3", unitPrice: 100, validFrom: "2026-09-25T12:00:00.000Z" },
      lastReviewedAt: "2026-09-25T12:00:00.000Z",
    },
  });

  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Revisar los 2" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Fideos" })).toBeVisible();

  await userEvent.fill(dialog.getByLabelText("Precio de venta por unidad"), "1");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.element(dialog.getByRole("heading", { name: "Arroz" })).toBeVisible();
  await expect.element(dialog.getByText("Precio actualizado")).toBeVisible();
  await expect.element(dialog.getByText("Fideos pasa a $ 1,00.")).toBeVisible();

  await userEvent.click(dialog.getByLabelText("Precio de venta por kilo"));
  await userEvent.keyboard("{Escape}");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));
  await expect.element(dialog.getByRole("heading", { name: "Arroz" })).toBeVisible();
  expect(dialog.getByText("Fideos pasa a $ 1,00.").query()).toBeNull();
});

test("a product that no longer exists disables the modal's actions and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "not_found" });
  const screen = await openArrozPriceModal(services);
  const loadsBefore = vi.mocked(services.fetchPrices).mock.calls.length;

  await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Producto desactivado");
  await expect
    .element(dialog.getByRole("button", { name: "Guardar el precio nuevo" }))
    .toBeDisabled();
  await expect
    .element(dialog.getByRole("button", { name: "Confirmar sin cambios" }))
    .toBeDisabled();
  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.length)
    .toBeGreaterThan(loadsBefore);
});

test("confirming a product that no longer exists keeps the modal open on its not-found notice and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "not_found" });
  const screen = await openArrozPriceModal(services);
  const loadsBefore = vi.mocked(services.fetchPrices).mock.calls.length;

  await userEvent.click(screen.getByRole("button", { name: "Confirmar sin cambios" }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Arroz" })).toBeVisible();
  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Producto desactivado");
  await expect
    .element(dialog.getByRole("button", { name: "Guardar el precio nuevo" }))
    .toBeDisabled();
  await expect
    .element(dialog.getByRole("button", { name: "Confirmar sin cambios" }))
    .toBeDisabled();
  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.length)
    .toBeGreaterThan(loadsBefore);
});

test("reloading a stale price for a product that is no longer listed shows its not-found notice and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
    })
    .mockResolvedValue({
      kind: "ok",
      value: { products: [], pendingCount: 0, reviewWindowDays: 30, categories: [] },
    });
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "stale_price" });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));
  await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("button", { name: "Recargar el precio" })).toBeVisible();
  const loadsBefore = vi.mocked(services.fetchPrices).mock.calls.length;

  await userEvent.click(dialog.getByRole("button", { name: "Recargar el precio" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Producto desactivado");
  await expect
    .element(dialog.getByRole("button", { name: "Guardar el precio nuevo" }))
    .toBeDisabled();
  await expect
    .element(dialog.getByRole("button", { name: "Confirmar sin cambios" }))
    .toBeDisabled();
  // One read is the modal's own reload; the other is the screen's list refresh.
  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.length)
    .toBeGreaterThanOrEqual(loadsBefore + 2);
});

test("confirming a row whose product no longer exists names it in the screen's notice", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
  });
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "not_found" });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
  );

  await expect.element(screen.getByText("Producto desactivado")).toBeVisible();
  await expect.element(screen.getByText("Arroz ya no está en el catálogo.")).toBeVisible();
});

test("Revisar los N moves past a product that no longer exists, naming it on the next one, and ends when none is left", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockImplementation(async () => ({
    kind: "ok",
    value: { products: [sinPrecio, arroz], pendingCount: 2, reviewWindowDays: 30, categories: [] },
  }));
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "not_found" });
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "not_found" });

  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Revisar los 2" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Fideos" })).toBeVisible();
  const loadsBefore = vi.mocked(services.fetchPrices).mock.calls.length;

  await userEvent.fill(dialog.getByLabelText("Precio de venta por unidad"), "1");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.element(dialog.getByRole("heading", { name: "Arroz" })).toBeVisible();
  await expect.element(dialog.getByText("Producto desactivado")).toBeVisible();
  await expect.element(dialog.getByText("Fideos ya no está en el catálogo.")).toBeVisible();
  await expect
    .element(dialog.getByRole("button", { name: "Confirmar sin cambios" }))
    .not.toBeDisabled();
  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.length)
    .toBeGreaterThan(loadsBefore);

  await userEvent.click(dialog.getByRole("button", { name: "Confirmar sin cambios" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Arroz ya no está en el catálogo.")).toBeVisible();
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function startWalkAndCloseWhileSaving(services: PricesListScreenServices) {
  vi.mocked(services.fetchPrices).mockImplementation(async () => ({
    kind: "ok",
    value: { products: [sinPrecio, arroz], pendingCount: 2, reviewWindowDays: 30, categories: [] },
  }));
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Revisar los 2" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Fideos" })).toBeVisible();
  await userEvent.fill(dialog.getByLabelText("Precio de venta por unidad"), "1");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));
  // The close button sits outside the test viewport, so the modal is dismissed with Escape from
  // inside it.
  await userEvent.click(dialog.getByLabelText("Precio de venta por unidad"));
  await userEvent.keyboard("{Escape}");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  return screen;
}

async function settleLateResult() {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

test("a save that succeeds after the walk's modal was closed opens no other product", async () => {
  const services = createServices();
  const pending = deferred<Awaited<ReturnType<PricesListScreenServices["setPrice"]>>>();
  vi.mocked(services.setPrice).mockReturnValue(pending.promise);
  const screen = await startWalkAndCloseWhileSaving(services);
  const loadsBefore = vi.mocked(services.fetchPrices).mock.calls.length;

  pending.resolve({
    kind: "ok",
    value: {
      price: { id: "price-3", unitPrice: 100, validFrom: "2026-09-25T12:00:00.000Z" },
      lastReviewedAt: "2026-09-25T12:00:00.000Z",
    },
  });

  await expect.element(screen.getByText("Precio actualizado")).toBeVisible();
  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.length)
    .toBeGreaterThan(loadsBefore);
  await settleLateResult();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("a save that finds the product gone after the walk's modal was closed opens no other product", async () => {
  const services = createServices();
  const pending = deferred<Awaited<ReturnType<PricesListScreenServices["setPrice"]>>>();
  vi.mocked(services.setPrice).mockReturnValue(pending.promise);
  const screen = await startWalkAndCloseWhileSaving(services);
  const loadsBefore = vi.mocked(services.fetchPrices).mock.calls.length;

  pending.resolve({ kind: "not_found" });

  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.length)
    .toBeGreaterThan(loadsBefore);
  await settleLateResult();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

async function openArrozAfterClosingTheWalk(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Arroz" })).toBeVisible();
  return dialog;
}

test("a save that succeeds after the modal moved to another product leaves that product open", async () => {
  const services = createServices();
  const pending = deferred<Awaited<ReturnType<PricesListScreenServices["setPrice"]>>>();
  vi.mocked(services.setPrice).mockReturnValue(pending.promise);
  const screen = await startWalkAndCloseWhileSaving(services);
  const dialog = await openArrozAfterClosingTheWalk(screen);

  pending.resolve({
    kind: "ok",
    value: {
      price: { id: "price-3", unitPrice: 100, validFrom: "2026-09-25T12:00:00.000Z" },
      lastReviewedAt: "2026-09-25T12:00:00.000Z",
    },
  });

  await expect.element(dialog.getByText("Precio actualizado")).toBeVisible();
  await expect.element(dialog.getByText("Fideos pasa a $ 1,00.")).toBeVisible();
  await settleLateResult();
  await expect.element(dialog.getByRole("heading", { name: "Arroz" })).toBeVisible();
});

test("a save that finds the product gone after the modal moved to another product leaves that product's actions available", async () => {
  const services = createServices();
  const pending = deferred<Awaited<ReturnType<PricesListScreenServices["setPrice"]>>>();
  vi.mocked(services.setPrice).mockReturnValue(pending.promise);
  const screen = await startWalkAndCloseWhileSaving(services);
  const dialog = await openArrozAfterClosingTheWalk(screen);
  const loadsBefore = vi.mocked(services.fetchPrices).mock.calls.length;

  pending.resolve({ kind: "not_found" });

  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.length)
    .toBeGreaterThan(loadsBefore);
  await settleLateResult();
  expect(dialog.getByRole("alert").query()).toBeNull();
  await expect.element(dialog.getByRole("button", { name: "Confirmar sin cambios" })).toBeEnabled();
});

test("a save that lands after the review filter changed refreshes the list for the current filter", async () => {
  const services = createServices();
  const pending = deferred<Awaited<ReturnType<PricesListScreenServices["setPrice"]>>>();
  vi.mocked(services.setPrice).mockReturnValue(pending.promise);
  const screen = await startWalkAndCloseWhileSaving(services);
  const yerba: PriceProduct = { ...arroz, id: "product-3", name: "Yerba" };
  vi.mocked(services.fetchPrices).mockImplementation(async (params) => ({
    kind: "ok",
    value: {
      products: params.review === "all" ? [sinPrecio, arroz, yerba] : [sinPrecio, arroz],
      pendingCount: 2,
      reviewWindowDays: 30,
      categories: [],
    },
  }));
  await userEvent.click(screen.getByRole("button", { name: "Revisión: Por revisar" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));
  await expect.element(screen.getByText("Yerba")).toBeVisible();
  const loadsBefore = vi.mocked(services.fetchPrices).mock.calls.length;

  pending.resolve({
    kind: "ok",
    value: {
      price: { id: "price-3", unitPrice: 100, validFrom: "2026-09-25T12:00:00.000Z" },
      lastReviewedAt: "2026-09-25T12:00:00.000Z",
    },
  });

  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.length)
    .toBeGreaterThan(loadsBefore);
  await settleLateResult();
  expect(vi.mocked(services.fetchPrices).mock.lastCall?.[0].review).toBe("all");
  await expect.element(screen.getByText("Yerba")).toBeVisible();
});

async function reopenFideosAndType(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Fideos" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Fideos" })).toBeVisible();
  await userEvent.fill(dialog.getByLabelText("Precio de venta por unidad"), "5");
  return dialog;
}

test("a save that succeeds after its modal was closed and the same product reopened keeps the reopened modal and its typed price", async () => {
  const services = createServices();
  const pending = deferred<Awaited<ReturnType<PricesListScreenServices["setPrice"]>>>();
  vi.mocked(services.setPrice).mockReturnValue(pending.promise);
  const screen = await startWalkAndCloseWhileSaving(services);
  const dialog = await reopenFideosAndType(screen);

  pending.resolve({
    kind: "ok",
    value: {
      price: { id: "price-3", unitPrice: 100, validFrom: "2026-09-25T12:00:00.000Z" },
      lastReviewedAt: "2026-09-25T12:00:00.000Z",
    },
  });

  await expect.element(dialog.getByText("Fideos pasa a $ 1,00.")).toBeVisible();
  await settleLateResult();
  await expect.element(dialog.getByRole("heading", { name: "Fideos" })).toBeVisible();
  await expect.element(dialog.getByLabelText("Precio de venta por unidad")).toHaveValue("5");
  await expect
    .element(dialog.getByRole("button", { name: "Guardar el precio nuevo" }))
    .toBeEnabled();
});

test("a save that succeeds after its modal was closed and the same product reopened shows the new price in the reopened modal and sends it on the next save", async () => {
  const services = createServices();
  const pending = deferred<Awaited<ReturnType<PricesListScreenServices["setPrice"]>>>();
  vi.mocked(services.setPrice).mockReturnValue(pending.promise);
  const screen = await startWalkAndCloseWhileSaving(services);
  const dialog = await reopenFideosAndType(screen);

  pending.resolve({
    kind: "ok",
    value: {
      price: { id: "price-3", unitPrice: 100, validFrom: "2026-09-25T12:00:00.000Z" },
      lastReviewedAt: "2026-09-25T12:00:00.000Z",
    },
  });

  await expect.element(dialog.getByText("Fideos pasa a $ 1,00.")).toBeVisible();
  await expect.element(dialog.getByText("REVISADO HOY")).toBeVisible();
  await expect.element(dialog.getByText("Precio actual: $ 1,00")).toBeVisible();
  expect(dialog.getByText("SIN PRECIO").query()).toBeNull();
  await expect.element(dialog.getByLabelText("Precio de venta por unidad")).toHaveValue("5");

  vi.mocked(services.setPrice).mockResolvedValue({ kind: "failed" });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect
    .poll(() => vi.mocked(services.setPrice).mock.lastCall)
    .toEqual(["product-1", { unitPrice: 500, expectedCurrentPriceId: "price-3" }]);
});

test("a save that finds the product gone after its modal was closed and the same product reopened puts the reopened modal on its not-found notice", async () => {
  const services = createServices();
  const pending = deferred<Awaited<ReturnType<PricesListScreenServices["setPrice"]>>>();
  vi.mocked(services.setPrice).mockReturnValue(pending.promise);
  const screen = await startWalkAndCloseWhileSaving(services);
  const dialog = await reopenFideosAndType(screen);
  const loadsBefore = vi.mocked(services.fetchPrices).mock.calls.length;

  pending.resolve({ kind: "not_found" });

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Producto desactivado");
  await expect
    .element(dialog.getByRole("button", { name: "Guardar el precio nuevo" }))
    .toBeDisabled();
  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.length)
    .toBeGreaterThan(loadsBefore);
});

test.each([
  {
    outcome: { kind: "stale_price" as const },
    title: "El precio cambió recién",
    detail: "Volvimos a cargar la lista con el precio actual de Arroz.",
  },
  {
    outcome: { kind: "not_found" as const },
    title: "Producto desactivado",
    detail: "Arroz ya no está en el catálogo.",
  },
  {
    outcome: { kind: "rate_limited" as const, retryAfterSeconds: 60 },
    title: "Demasiadas solicitudes",
    detail: "Se puede volver a intentar en 1 minuto.",
  },
  {
    outcome: { kind: "failed" as const },
    title: "No se pudo confirmar el precio de Arroz",
    detail: "Probá de nuevo.",
  },
])(
  "a row confirm that ends in $outcome.kind while another product's modal is open shows its notice inside the modal",
  async ({ outcome, title, detail }) => {
    const services = createServices();
    vi.mocked(services.fetchPrices).mockResolvedValue({
      kind: "ok",
      value: {
        products: [arroz, sinPrecio],
        pendingCount: 2,
        reviewWindowDays: 30,
        categories: [],
      },
    });
    const pending = deferred<Awaited<ReturnType<PricesListScreenServices["confirmPrice"]>>>();
    vi.mocked(services.confirmPrice).mockReturnValue(pending.promise);

    const screen = await renderScreen(services);
    await expect.element(screen.getByText("Arroz")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Fideos" }));
    const dialog = screen.getByRole("dialog");
    await expect.element(dialog.getByRole("heading", { name: "Fideos" })).toBeVisible();

    pending.resolve(outcome);

    await expect.element(dialog.getByText(title)).toBeVisible();
    await expect.element(dialog.getByText(detail)).toBeVisible();
  },
);

test("a notice about a previous product leaves the modal once the modal shows its own", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockImplementation(async () => ({
    kind: "ok",
    value: { products: [sinPrecio, arroz], pendingCount: 2, reviewWindowDays: 30, categories: [] },
  }));
  vi.mocked(services.setPrice).mockResolvedValue({
    kind: "ok",
    value: {
      price: { id: "price-3", unitPrice: 100, validFrom: "2026-09-25T12:00:00.000Z" },
      lastReviewedAt: "2026-09-25T12:00:00.000Z",
    },
  });
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "failed" });

  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Revisar los 2" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Fideos" })).toBeVisible();
  await userEvent.fill(dialog.getByLabelText("Precio de venta por unidad"), "1");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));
  await expect.element(dialog.getByText("Fideos pasa a $ 1,00.")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Confirmar sin cambios" }));

  await expect.element(dialog.getByText("No se pudo confirmar el precio")).toBeVisible();
  expect(dialog.getByText("Fideos pasa a $ 1,00.").query()).toBeNull();
});
