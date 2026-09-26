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
  pending: true,
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
  pending: true,
};

async function renderScreen(
  services: PricesListScreenServices,
  onSessionEnded: () => void = () => {},
  now: () => Date = NOW,
) {
  const screen = (
    <main>
      <PricesListScreen services={services} onSessionEnded={onSessionEnded} now={now} />
    </main>
  );
  const rendered = await render(screen);
  return Object.assign(rendered, {
    /** Lets every settled promise's continuation run (they all run before the next task), then
     * re-renders the same element inside act, which commits every update scheduled by then, so a
     * following assertion that something did not happen runs after it could have happened. */
    commitScheduledUpdates: async () => {
      await nextTask();
      await rendered.rerender(screen);
    },
  });
}

/** A MessageChannel task rather than a timer, so it still runs while setTimeout is faked. */
function nextTask() {
  return new Promise((settle) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => settle(undefined);
    channel.port2.postMessage(null);
  });
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

test("shows each reason a typed price can't be saved without calling the server", async () => {
  const services = createServices();
  const screen = await openArrozPriceModal(services);
  const priceField = screen.getByLabelText("Precio de venta por kilo");
  const save = screen.getByRole("button", { name: "Guardar el precio nuevo" });

  await userEvent.click(save);
  await expect.element(screen.getByText("Ingresá el precio nuevo.")).toBeVisible();

  await userEvent.fill(priceField, "12.50");
  await userEvent.click(save);
  await expect
    .element(
      screen.getByText("Escribí el precio con coma para los decimales, por ejemplo 7.500,50."),
    )
    .toBeVisible();

  await userEvent.fill(priceField, "0");
  await userEvent.click(save);
  await expect.element(screen.getByText("Ingresá un precio válido, mayor a cero.")).toBeVisible();

  await userEvent.fill(priceField, "21.474.836,48");
  await userEvent.click(save);
  await expect
    .element(screen.getByText("Ingresá un precio de hasta $ 21.474.836,47."))
    .toBeVisible();

  expect(services.setPrice).not.toHaveBeenCalled();
});

test("sends the typed price in cents", async () => {
  const services = createServices();
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "failed" });
  const screen = await openArrozPriceModal(services);

  await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "7.500,50");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.poll(() => vi.mocked(services.setPrice).mock.lastCall?.[1].unitPrice).toBe(750050);
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

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Precio confirmado")).toBeVisible();
  await expect.element(screen.getByText("Arroz sigue a $ 7.500,00 / kg.")).toBeVisible();
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
  await expect.poll(() => dialog.getByText("Fideos pasa a $ 1,00.").query()).toBeNull();
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
test("the modal cannot be closed while its save is in flight", async () => {
  const services = createServices();
  const pending = deferred<Awaited<ReturnType<PricesListScreenServices["setPrice"]>>>();
  vi.mocked(services.setPrice).mockReturnValue(pending.promise);
  const screen = await openArrozPriceModal(services);
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();

  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));
  await expect
    .element(dialog.getByRole("button", { name: "Guardar el precio nuevo" }))
    .toBeDisabled();

  expect(dialog.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
  await userEvent.click(dialog.getByLabelText("Precio de venta por kilo"));
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog.getByRole("heading", { name: "Arroz" })).toBeVisible();

  pending.resolve({ kind: "failed" });
  await expect.element(dialog.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
});

const yerba: PriceProduct = {
  ...arroz,
  id: "product-3",
  name: "Yerba",
  currentPrice: { id: "price-3", unitPrice: 300000, validFrom: "2026-08-16T12:00:00.000Z" },
};

function expectRowActionsDisabled(screen: Awaited<ReturnType<typeof renderScreen>>) {
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

test("while a row confirm is in flight no price can be opened, reviewed or confirmed", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz, yerba], pendingCount: 2, reviewWindowDays: 30, categories: [] },
  });
  const pending = deferred<Awaited<ReturnType<PricesListScreenServices["confirmPrice"]>>>();
  vi.mocked(services.confirmPrice).mockReturnValue(pending.promise);

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
  );

  await expectRowActionsDisabled(screen);

  pending.resolve({ kind: "failed" });
  await expect
    .element(screen.getByRole("button", { name: "Cambiar el precio de Yerba" }))
    .toBeEnabled();
});

test("while Revisar los N is loading the pending products, no row action can start", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [arroz, yerba], pendingCount: 2, reviewWindowDays: 30, categories: [] },
    })
    .mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Revisar los 2" }));

  await expectRowActionsDisabled(screen);
});

test.each([
  {
    outcome: { kind: "stale_price" as const },
    title: "El precio cambió recién",
    detail: "Revisá el precio actual de Arroz.",
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
  "a row confirm that ends in $outcome.kind shows its notice on the screen, whether or not the list has reloaded yet",
  async ({ outcome, title, detail }) => {
    const services = createServices();
    vi.mocked(services.fetchPrices)
      .mockResolvedValueOnce({
        kind: "ok",
        value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
      })
      .mockReturnValue(new Promise(() => {}));
    vi.mocked(services.confirmPrice).mockResolvedValue(outcome);

    const screen = await renderScreen(services);
    await expect.element(screen.getByText("Arroz")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
    );

    await expect.element(screen.getByText(title)).toBeVisible();
    await expect.element(screen.getByText(detail)).toBeVisible();
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
  await expect.poll(() => dialog.getByText("Fideos pasa a $ 1,00.").query()).toBeNull();
});

const arrozStaleReload = {
  kind: "ok" as const,
  value: {
    products: [
      {
        ...arroz,
        currentPrice: { id: "price-9", unitPrice: 900000, validFrom: "2026-09-25T00:00:00.000Z" },
      },
    ],
    pendingCount: 1,
    reviewWindowDays: 30,
    categories: [],
  },
};

test("a save that throws ends in the save-failed notice and the modal can be closed again", async () => {
  const services = createServices();
  vi.mocked(services.setPrice).mockRejectedValue(new Error("network down"));
  const screen = await openArrozPriceModal(services);
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.element(dialog.getByText("No se pudo guardar el precio")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
});

test("a confirmation that throws ends in the confirm-failed notice and the modal can be closed again", async () => {
  const services = createServices();
  vi.mocked(services.confirmPrice).mockRejectedValue(new Error("network down"));
  const screen = await openArrozPriceModal(services);
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Confirmar sin cambios" }));

  await expect.element(dialog.getByText("No se pudo confirmar el precio")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
});

test("a price reload that throws ends in the reload-failed notice and the modal can be closed again", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
    })
    .mockRejectedValue(new Error("network down"));
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "stale_price" });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));
  await userEvent.click(dialog.getByRole("button", { name: "Recargar el precio" }));

  await expect.element(dialog.getByText("No se pudieron recargar los datos")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
});

test("a row confirmation that throws shows its failure notice and re-enables the row actions", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz, yerba], pendingCount: 2, reviewWindowDays: 30, categories: [] },
  });
  vi.mocked(services.confirmPrice).mockRejectedValue(new Error("network down"));

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
  );

  await expect.element(screen.getByText("No se pudo confirmar el precio de Arroz")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Cambiar el precio de Yerba" }))
    .toBeEnabled();
});

test("a Revisar los N read that throws shows a notice, keeps the table and re-enables the row actions", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [arroz, yerba], pendingCount: 2, reviewWindowDays: 30, categories: [] },
    })
    .mockRejectedValue(new Error("network down"));

  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Revisar los 2" }));

  await expect.element(screen.getByText("No se pudo empezar la revisión")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Cambiar el precio de Yerba" }))
    .toBeEnabled();
});

test("Revisar los N with nothing left under Por revisar reloads the list and leaves the saying to its empty state", async () => {
  const services = createServices();
  const nothingPending = {
    kind: "ok" as const,
    value: { products: [], pendingCount: 0, reviewWindowDays: 30, categories: [] },
  };
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
    })
    .mockResolvedValue(nothingPending);

  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Revisar 1" }));

  await expect.poll(() => vi.mocked(services.fetchPrices).mock.calls.length).toBe(3);
  expect(vi.mocked(services.fetchPrices).mock.lastCall?.[0]).toEqual({ review: "pending" });
  await expect
    .element(screen.getByText("Todos los precios se revisaron en los últimos 30 días."))
    .toBeVisible();
  expect(screen.getByText("Arroz").query()).toBeNull();
  expect(screen.getByText("Precios al día").elements()).toHaveLength(1);
  expect(screen.getByText("No quedan precios por revisar").query()).toBeNull();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("Revisar los N with nothing left under another filter reloads the list and says none is left to review", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockImplementation(async (filters) =>
    filters.review === "pending"
      ? {
          kind: "ok",
          value: { products: [], pendingCount: 0, reviewWindowDays: 15, categories: [] },
        }
      : {
          kind: "ok",
          value: { products: [arroz], pendingCount: 1, reviewWindowDays: 15, categories: [] },
        },
  );
  vi.mocked(services.fetchPrices).mockResolvedValueOnce({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 15, categories: [] },
  });

  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Revisión: Por revisar" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));
  await expect.poll(() => vi.mocked(services.fetchPrices).mock.calls.length).toBe(2);
  await userEvent.click(screen.getByRole("button", { name: "Revisar 1" }));

  await expect.element(screen.getByText("No quedan precios por revisar")).toBeVisible();
  await expect
    .element(screen.getByText("Todos los precios se revisaron en los últimos 15 días."))
    .toBeVisible();
  await expect.poll(() => vi.mocked(services.fetchPrices).mock.calls.length).toBe(4);
  expect(vi.mocked(services.fetchPrices).mock.lastCall?.[0]).toEqual({ review: "all" });
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test.each([
  {
    outcome: { kind: "failed" as const },
    title: "No se pudo empezar la revisión",
    detail: "Probá de nuevo.",
  },
  {
    outcome: { kind: "rate_limited" as const, retryAfterSeconds: 120 },
    title: "Demasiadas solicitudes",
    detail: "Se puede volver a intentar en 2 minutos.",
  },
])(
  "a Revisar los N read that ends in $outcome.kind keeps the table and shows its notice",
  async ({ outcome, title, detail }) => {
    const services = createServices();
    vi.mocked(services.fetchPrices)
      .mockResolvedValueOnce({
        kind: "ok",
        value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
      })
      .mockResolvedValueOnce(outcome);

    const screen = await renderScreen(services);
    await userEvent.click(screen.getByRole("button", { name: "Revisar 1" }));

    await expect.element(screen.getByText(title)).toBeVisible();
    await expect.element(screen.getByText(detail)).toBeVisible();
    await expect.element(screen.getByText("Arroz")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reintentar" }).query()).toBeNull();
  },
);

test("a failed first load offers to retry, and a retry shows the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue({
      kind: "ok",
      value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
    });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir los precios")).toBeVisible();
  await expect.element(screen.getByText("Probá de nuevo en unos minutos.")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Arroz")).toBeVisible();
});

test("a rate-limited first load shows when to try again and offers to retry", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("an earlier list load that settles after a later one does not replace it", async () => {
  const services = createServices();
  type FetchOutcome = Awaited<ReturnType<PricesListScreenServices["fetchPrices"]>>;
  const first = deferred<FetchOutcome>();
  const second = deferred<FetchOutcome>();
  vi.mocked(services.fetchPrices)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);

  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Revisión: Por revisar" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));
  await expect.poll(() => vi.mocked(services.fetchPrices).mock.calls.length).toBe(2);

  second.resolve({
    kind: "ok",
    value: { products: [yerba], pendingCount: 1, reviewWindowDays: 30, categories: [] },
  });
  await expect.element(screen.getByText("Yerba")).toBeVisible();
  first.resolve({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
  });
  await screen.commitScheduledUpdates();

  expect(screen.getByText("Arroz").query()).toBeNull();
  await expect.element(screen.getByText("Yerba")).toBeVisible();
});

test.each([
  {
    action: "save",
    setUp: (services: PricesListScreenServices) =>
      vi.mocked(services.setPrice).mockResolvedValue({ kind: "failed" }),
    title: "No se pudo guardar el precio",
    detail: "Probá de nuevo.",
  },
  {
    action: "save",
    setUp: (services: PricesListScreenServices) =>
      vi.mocked(services.setPrice).mockResolvedValue({
        kind: "rate_limited",
        retryAfterSeconds: 120,
      }),
    title: "Demasiadas solicitudes",
    detail: "Se puede volver a intentar en 2 minutos.",
  },
  {
    action: "confirm",
    setUp: (services: PricesListScreenServices) =>
      vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "failed" }),
    title: "No se pudo confirmar el precio",
    detail: "Probá de nuevo.",
  },
  {
    action: "confirm",
    setUp: (services: PricesListScreenServices) =>
      vi.mocked(services.confirmPrice).mockResolvedValue({
        kind: "rate_limited",
        retryAfterSeconds: 120,
      }),
    title: "Demasiadas solicitudes",
    detail: "Se puede volver a intentar en 2 minutos.",
  },
])("a modal $action that fails shows $title", async ({ action, setUp, title, detail }) => {
  const services = createServices();
  setUp(services);
  const screen = await openArrozPriceModal(services);
  const dialog = screen.getByRole("dialog");

  if (action === "save") {
    await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
    await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));
  } else {
    await userEvent.click(dialog.getByRole("button", { name: "Confirmar sin cambios" }));
  }

  await expect.element(dialog.getByText(title)).toBeVisible();
  await expect.element(dialog.getByText(detail)).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
});

test("the current price typed again is rejected as unchanged without calling the server", async () => {
  const services = createServices();
  const screen = await openArrozPriceModal(services);
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "7.500");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect
    .element(dialog.getByText("Es el precio actual: confirmalo sin cambios en vez de guardarlo."))
    .toBeVisible();
  expect(services.setPrice).not.toHaveBeenCalled();
});

test("the server answering that the price is unchanged shows the same unchanged-price error", async () => {
  const services = createServices();
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "price_unchanged" });
  const screen = await openArrozPriceModal(services);
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect
    .element(dialog.getByText("Es el precio actual: confirmalo sin cambios en vez de guardarlo."))
    .toBeVisible();
});

test("a reloaded price is shown and becomes the one the next save and confirmation expect", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
    })
    .mockResolvedValue(arrozStaleReload);
  vi.mocked(services.setPrice)
    .mockResolvedValueOnce({ kind: "stale_price" })
    .mockResolvedValue({ kind: "failed" });
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "failed" });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));
  await userEvent.click(dialog.getByRole("button", { name: "Recargar el precio" }));

  await expect.element(dialog.getByText("Precio actual: $ 9.000,00 / kg")).toBeVisible();
  await expect
    .poll(() => dialog.getByText("Este precio cambió mientras lo mirabas").query())
    .toBeNull();

  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));
  await expect
    .poll(() => vi.mocked(services.setPrice).mock.lastCall?.[1])
    .toEqual({ unitPrice: 800000, expectedCurrentPriceId: "price-9" });

  await userEvent.click(dialog.getByRole("button", { name: "Confirmar sin cambios" }));
  await expect
    .poll(() => vi.mocked(services.confirmPrice).mock.lastCall)
    .toEqual(["product-2", { expectedCurrentPriceId: "price-9" }]);
});

test("the modal offers no confirm-without-change action for a product with no price", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [sinPrecio], pendingCount: 1, reviewWindowDays: 30, categories: [] },
  });

  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Fideos" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Fideos" })).toBeVisible();

  await expect
    .element(dialog.getByRole("button", { name: "Guardar el precio nuevo" }))
    .toBeVisible();
  expect(dialog.getByRole("button", { name: "Confirmar sin cambios" }).query()).toBeNull();
});

test("a modal save that finds no open session ends the session", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
  });
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("a row confirmation that finds no open session ends the session", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
  });
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  const screen = await renderScreen(services, onSessionEnded);
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
  );

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("a row confirmation answered forbidden navigates to Mi cuenta", async () => {
  window.history.pushState(null, "", "/catalog/prices");
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
  });
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "forbidden" });

  const screen = await renderScreen(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
  );

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("the screen with the price modal open has no accessibility violations", async () => {
  const services = createServices();
  const screen = await openArrozPriceModal(services);
  await expect
    .element(screen.getByRole("dialog").getByRole("heading", { name: "Arroz" }))
    .toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});

test("an error notice does not leave with time, only with the person's next action", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
  });
  vi.mocked(services.confirmPrice)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue({ kind: "ok", value: { lastReviewedAt: "2026-09-25T12:00:00.000Z" } });
  const screen = await renderScreen(services);
  const confirm = screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" });
  await expect.element(confirm).toBeVisible();

  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    await userEvent.click(confirm);
    await expect.element(screen.getByText("No se pudo confirmar el precio de Arroz")).toBeVisible();

    vi.advanceTimersByTime(60_000);
    await screen.commitScheduledUpdates();
    expect(screen.getByText("No se pudo confirmar el precio de Arroz").query()).not.toBeNull();

    await userEvent.click(confirm);
    await expect.element(screen.getByText("Precio confirmado")).toBeVisible();
    expect(screen.getByText("No se pudo confirmar el precio de Arroz").query()).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("a success notice leaves the screen on its own after a few seconds", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
  });
  vi.mocked(services.confirmPrice).mockResolvedValue({
    kind: "ok",
    value: { lastReviewedAt: "2026-09-25T12:00:00.000Z" },
  });
  const screen = await renderScreen(services);
  const confirm = screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" });
  await expect.element(confirm).toBeVisible();

  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    await userEvent.click(confirm);
    await expect.element(screen.getByText("Precio confirmado")).toBeVisible();

    vi.advanceTimersByTime(5_000);

    await expect.poll(() => screen.getByText("Precio confirmado").query()).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("a second identical notice in a row is announced again", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
  });
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  const confirm = screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" });
  await expect.element(confirm).toBeVisible();
  const announcementText = "No se pudo confirmar el precio de Arroz Probá de nuevo.";

  await userEvent.click(confirm);
  await expect.element(screen.getByRole("alert")).toHaveTextContent(announcementText);
  const firstAnnouncement = screen.getByRole("alert").element();
  await expect.element(confirm).toBeEnabled();

  await userEvent.click(confirm);

  await expect.poll(() => vi.mocked(services.confirmPrice).mock.calls.length).toBe(2);
  await expect
    .poll(() => {
      const announcement = screen.getByRole("alert").query();
      return (
        announcement !== null &&
        announcement !== firstAnnouncement &&
        announcement.textContent === announcementText
      );
    })
    .toBe(true);
});

test.each([
  {
    reviewedAt: new Date(2026, 8, 24, 23, 0),
    viewedAt: new Date(2026, 8, 25, 8, 0),
    cell: "Hace 1 día",
    eyebrow: "REVISADO HACE 1 DÍA",
  },
  {
    reviewedAt: new Date(2026, 8, 25, 0, 10),
    viewedAt: new Date(2026, 8, 25, 23, 50),
    cell: "Hoy",
    eyebrow: "REVISADO HOY",
  },
])(
  "the review age counts local calendar days, so one viewed at $viewedAt reads $cell",
  async ({ reviewedAt, viewedAt, cell, eyebrow }) => {
    const services = createServices();
    vi.mocked(services.fetchPrices).mockResolvedValue({
      kind: "ok",
      value: {
        products: [{ ...arroz, lastReviewedAt: reviewedAt.toISOString(), pending: false }],
        pendingCount: 0,
        reviewWindowDays: 30,
        categories: [],
      },
    });

    const screen = await renderScreen(
      services,
      () => {},
      () => viewedAt,
    );
    await expect.element(screen.getByText("Arroz")).toBeVisible();

    await expect.element(screen.getByText(cell, { exact: true })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));
    await expect.element(screen.getByRole("dialog").getByText(eyebrow)).toBeVisible();
  },
);

test("a save rejected for the price it expected is treated as a changed price and offers the reload", async () => {
  const services = createServices();
  vi.mocked(services.setPrice).mockResolvedValue({
    kind: "validation_failed",
    field: "expectedCurrentPriceId",
  });
  const screen = await openArrozPriceModal(services);
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.element(dialog.getByText("Este precio cambió mientras lo mirabas")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Recargar el precio" })).toBeVisible();
  expect(dialog.getByText("Ingresá un precio válido, mayor a cero.").query()).toBeNull();
});

test("a save rejected for its amount shows the amount error", async () => {
  const services = createServices();
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "validation_failed", field: "unitPrice" });
  const screen = await openArrozPriceModal(services);
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.element(dialog.getByText("Ingresá un precio válido, mayor a cero.")).toBeVisible();
});

test("a confirmation answered that there is no price to confirm offers the reload", async () => {
  const services = createServices();
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "no_price_to_confirm" });
  const screen = await openArrozPriceModal(services);
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Confirmar sin cambios" }));

  await expect
    .element(dialog.getByRole("alert"))
    .toHaveTextContent("No hay un precio para confirmar");
  expect(dialog.getByRole("alert").element().textContent).toBe("No hay un precio para confirmar");
  await expect.element(dialog.getByRole("button", { name: "Recargar el precio" })).toBeVisible();
});

test("a row confirmation answered that there is no price to confirm reloads the list and names the product", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
    })
    .mockResolvedValue({
      kind: "ok",
      value: {
        products: [{ ...arroz, currentPrice: null, lastReviewedAt: null }],
        pendingCount: 1,
        reviewWindowDays: 30,
        categories: [],
      },
    });
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "no_price_to_confirm" });

  const screen = await renderScreen(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
  );

  await expect.element(screen.getByText("No hay un precio para confirmar")).toBeVisible();
  await expect.element(screen.getByText("Arroz todavía no tiene precio.")).toBeVisible();
  await expect.element(screen.getByText("Sin precio")).toBeVisible();
  await screen.commitScheduledUpdates();
  await expect.element(screen.getByText("Arroz todavía no tiene precio.")).toBeVisible();
  expect(screen.getByText("No se pudo confirmar el precio de Arroz").query()).toBeNull();
});

test("a first load that throws ends in the load error and offers to retry", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockRejectedValue(new Error("network down"));

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir los precios")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("a refresh that throws ends in the load error and offers to retry", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
    })
    .mockRejectedValue(new Error("network down"));

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Revisión: Por revisar" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));

  await expect.element(screen.getByText("No pudimos abrir los precios")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

async function showRowConfirmFailure(services: PricesListScreenServices) {
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [almacen] },
  });
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
  );
  await expect.element(screen.getByText("No se pudo confirmar el precio de Arroz")).toBeVisible();
  return screen;
}

test("an error notice leaves when the review filter changes", async () => {
  const services = createServices();
  const screen = await showRowConfirmFailure(services);

  await userEvent.click(screen.getByRole("button", { name: "Revisión: Por revisar" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));

  await expect
    .poll(() => screen.getByText("No se pudo confirmar el precio de Arroz").query())
    .toBeNull();
});

test("an error notice leaves when a price is opened", async () => {
  const services = createServices();
  const screen = await showRowConfirmFailure(services);

  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));

  await expect.element(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByText("No se pudo confirmar el precio de Arroz").query()).toBeNull();
});

test("an error notice leaves with a keystroke in the search field", async () => {
  const services = createServices();
  const screen = await showRowConfirmFailure(services);
  vi.mocked(services.fetchPrices).mockReturnValue(new Promise(() => {}));

  await userEvent.type(screen.getByPlaceholder("Buscar un producto"), "a");

  await expect
    .poll(() => screen.getByText("No se pudo confirmar el precio de Arroz").query())
    .toBeNull();
});

test("an error notice leaves when the category filter changes", async () => {
  const services = createServices();
  const screen = await showRowConfirmFailure(services);
  vi.mocked(services.fetchPrices).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: "Categoría: Todas" }));
  await userEvent.click(screen.getByRole("option", { name: "Almacén" }));

  await expect
    .poll(() => screen.getByText("No se pudo confirmar el precio de Arroz").query())
    .toBeNull();
});

test("an error notice leaves when Revisar starts, before its read settles", async () => {
  const services = createServices();
  const screen = await showRowConfirmFailure(services);
  vi.mocked(services.fetchPrices).mockReturnValue(new Promise(() => {}));

  await userEvent.click(screen.getByRole("button", { name: "Revisar 1" }));

  await expect
    .poll(() => screen.getByText("No se pudo confirmar el precio de Arroz").query())
    .toBeNull();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("an error notice leaves when a row confirm starts, before its result settles", async () => {
  const services = createServices();
  const screen = await showRowConfirmFailure(services);
  const pending = deferred<Awaited<ReturnType<PricesListScreenServices["confirmPrice"]>>>();
  vi.mocked(services.confirmPrice).mockReturnValue(pending.promise);

  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
  );

  await expect
    .poll(() => screen.getByText("No se pudo confirmar el precio de Arroz").query())
    .toBeNull();
  expect(vi.mocked(services.confirmPrice)).toHaveBeenCalledTimes(2);
});

test("an error notice leaves when Reintentar is pressed", async () => {
  const services = createServices();
  type FetchOutcome = Awaited<ReturnType<PricesListScreenServices["fetchPrices"]>>;
  const refresh = deferred<FetchOutcome>();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
    })
    .mockReturnValueOnce(refresh.promise)
    .mockReturnValue(new Promise(() => {}));
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Revisión: Por revisar" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
  );
  await expect.element(screen.getByText("No se pudo confirmar el precio de Arroz")).toBeVisible();
  refresh.resolve({ kind: "failed" });
  const retry = screen.getByRole("button", { name: "Reintentar" });
  await expect.element(retry).toBeVisible();
  expect(screen.getByText("No se pudo confirmar el precio de Arroz").query()).not.toBeNull();

  await userEvent.click(retry);

  await expect
    .poll(() => screen.getByText("No se pudo confirmar el precio de Arroz").query())
    .toBeNull();
});

test("an error notice stays when a list load succeeds after it", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
    })
    .mockResolvedValue({
      kind: "ok",
      value: { products: [arroz], pendingCount: 3, reviewWindowDays: 30, categories: [] },
    });
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  const confirm = screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" });
  await expect.element(confirm).toBeVisible();

  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    await userEvent.fill(screen.getByPlaceholder("Buscar un producto"), "arr");
    await userEvent.click(confirm);
    await expect.element(screen.getByText("No se pudo confirmar el precio de Arroz")).toBeVisible();

    vi.advanceTimersByTime(300);

    await expect.element(screen.getByRole("button", { name: "Revisar los 3" })).toBeVisible();
    expect(vi.mocked(services.fetchPrices).mock.lastCall?.[0]).toEqual({
      review: "pending",
      search: "arr",
    });
    await screen.commitScheduledUpdates();
    expect(screen.getByText("No se pudo confirmar el precio de Arroz").query()).not.toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("a rate-limited notice leaves once its retry window has passed", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: { products: [arroz], pendingCount: 1, reviewWindowDays: 30, categories: [] },
  });
  vi.mocked(services.confirmPrice).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await renderScreen(services);
  const confirm = screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" });
  await expect.element(confirm).toBeVisible();

  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    await userEvent.click(confirm);
    await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();

    vi.advanceTimersByTime(119_000);
    await screen.commitScheduledUpdates();
    expect(screen.getByText("Demasiadas solicitudes").query()).not.toBeNull();

    vi.advanceTimersByTime(1_000);
    await expect.poll(() => screen.getByText("Demasiadas solicitudes").query()).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("a price reviewed earlier today is announced as reviewed today even with a zero-day review window", async () => {
  const viewedAt = new Date(2026, 8, 25, 12, 0);
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [{ ...arroz, lastReviewedAt: new Date(2026, 8, 25, 8, 0).toISOString() }],
      pendingCount: 1,
      reviewWindowDays: 0,
      categories: [],
    },
  });

  const screen = await renderScreen(
    services,
    () => {},
    () => viewedAt,
  );
  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));

  await expect.element(screen.getByRole("dialog").getByText("REVISADO HOY")).toBeVisible();
});

test.each([
  { pending: false, eyebrow: "REVISADO HACE 30 DÍAS" },
  { pending: true, eyebrow: "SIN REVISAR HACE 30 DÍAS" },
])(
  "the modal calls a price overdue exactly when the cloud marks it pending: $eyebrow",
  async ({ pending, eyebrow }) => {
    const viewedAt = new Date(2026, 8, 25, 12, 0);
    const services = createServices();
    vi.mocked(services.fetchPrices).mockResolvedValue({
      kind: "ok",
      value: {
        products: [
          {
            ...arroz,
            lastReviewedAt: new Date(2026, 7, 26, 12, 0).toISOString(),
            pending,
          },
        ],
        pendingCount: 0,
        reviewWindowDays: 30,
        categories: [],
      },
    });

    const screen = await renderScreen(
      services,
      () => {},
      () => viewedAt,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));

    await expect.element(screen.getByRole("dialog").getByText(eyebrow)).toBeVisible();
  },
);
