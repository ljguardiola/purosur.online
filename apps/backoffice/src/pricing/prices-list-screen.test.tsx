import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { PricesListScreenServices } from "./prices-list-services";
import { pricesListFilters } from "./routes";
import {
  createServices,
  deferred,
  expectRowActionsDisabled,
  openRicePriceModal,
  renderScreen,
  rice,
  withoutPrice,
  yerbaMate,
} from "./test-support/prices-list-screen";

test("shows the breadcrumb, heading, and each product's name", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [withoutPrice, rice],
      pendingCount: 2,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
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
    value: {
      products: [withoutPrice, rice],
      pendingCount: 2,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
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
    value: {
      products: [withoutPrice],
      pendingCount: 1,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
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

test("a second click on a row's confirm while the first is in flight sends no second confirmation", async () => {
  const services = createServices();
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
      value: {
        products: [rice],
        pendingCount: 1,
        activeProductCount: 3,
        reviewWindowDays: 30,
        categories: [],
      },
    })
    .mockResolvedValueOnce({
      kind: "ok",
      value: {
        products: [],
        pendingCount: 0,
        activeProductCount: 3,
        reviewWindowDays: 30,
        categories: [],
      },
    });
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "ok" });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));
  await expect.element(screen.getByRole("heading", { name: "Arroz" })).toBeVisible();

  await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect
    .poll(() => vi.mocked(services.setPrice).mock.lastCall)
    .toEqual([
      "product-2",
      { unitPrice: 800000, expectedCurrentPriceId: "00000000-0000-4000-8000-000000000001" },
    ]);
  await expect.element(screen.getByText("Precio actualizado")).toBeVisible();
  await expect.element(screen.getByText("Arroz pasa a $ 8.000,00 / kg.")).toBeVisible();
});

test("shows the empty state when nothing is pending review", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [],
      pendingCount: 0,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Precios al día")).toBeVisible();
  await expect
    .element(screen.getByText("Todos los precios se revisaron en los últimos 30 días."))
    .toBeVisible();
  expect(screen.getByRole("button", { name: /Revisar/ }).query()).toBeNull();
});

test("keeps the previous rows and the Revisar button on screen while the list refreshes", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: {
        products: [rice, withoutPrice],
        pendingCount: 2,
        activeProductCount: 3,
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

test("while a row confirm is in flight no price can be opened, reviewed or confirmed", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [rice, yerbaMate],
      pendingCount: 2,
      activeProductCount: 3,
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

  await expectRowActionsDisabled(screen);

  pending.resolve({ kind: "failed" });
  await expect
    .element(screen.getByRole("button", { name: "Cambiar el precio de Yerba" }))
    .toBeEnabled();
});

test("reloading a stale price for a product that is no longer listed shows its not-found notice and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: {
        products: [rice],
        pendingCount: 1,
        activeProductCount: 3,
        reviewWindowDays: 30,
        categories: [],
      },
    })
    .mockResolvedValue({
      kind: "ok",
      value: {
        products: [],
        pendingCount: 0,
        activeProductCount: 3,
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
  const loadsFromModalReloadAndListRefresh = loadsBefore + 2;
  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.length)
    .toBeGreaterThanOrEqual(loadsFromModalReloadAndListRefresh);
});

test("a reloaded price is read again from the whole prices list and shown in the modal", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: {
        products: [rice],
        pendingCount: 1,
        activeProductCount: 3,
        reviewWindowDays: 30,
        categories: [],
      },
    })
    .mockResolvedValue({
      kind: "ok",
      value: {
        products: [
          {
            ...rice,
            currentPrice: {
              id: "00000000-0000-4000-8000-000000000009",
              unitPrice: 900000,
              validFrom: "2026-09-25T00:00:00.000Z",
            },
          },
        ],
        pendingCount: 1,
        activeProductCount: 3,
        reviewWindowDays: 30,
        categories: [],
      },
    });
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "stale_price" });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));
  await userEvent.click(dialog.getByRole("button", { name: "Recargar el precio" }));

  await expect.element(dialog.getByText("Precio actual: $ 9.000,00 / kg")).toBeVisible();
  expect(services.fetchPrices).toHaveBeenCalledWith({ review: "all" });
});

test("a price reload that throws ends in the reload-failed notice and the modal can be closed again", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: {
        products: [rice],
        pendingCount: 1,
        activeProductCount: 3,
        reviewWindowDays: 30,
        categories: [],
      },
    })
    .mockImplementation(({ review }) =>
      review === "all"
        ? Promise.reject(new Error("network down"))
        : Promise.resolve({
            kind: "ok",
            value: {
              products: [rice],
              pendingCount: 1,
              activeProductCount: 3,
              reviewWindowDays: 30,
              categories: [],
            },
          }),
    );
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

test("a failed first load offers to retry, and a retry shows the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue({
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

test("keeps the filters on screen while the list failed to load, and a retry shows the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue({
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
  await expect.element(screen.getByText("No pudimos abrir los precios")).toBeVisible();

  await expect.element(screen.getByPlaceholder("Buscar un producto")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Revisión: Por revisar" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await expect.element(screen.getByText("Arroz")).toBeVisible();
});

test("shows the blank empty state under Por revisar when the catalog has no active products", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [],
      pendingCount: 0,
      activeProductCount: 0,
      reviewWindowDays: 30,
      categories: [],
    },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();
  await expect
    .element(screen.getByText("Creá uno en Productos para ponerle precio."))
    .toBeVisible();
  expect(screen.getByText("Precios al día").query()).toBeNull();
});

test("the Revisar action is disabled while the list loads, and after it fails to load", async () => {
  const services = createServices();
  const firstLoad = deferred<Awaited<ReturnType<PricesListScreenServices["fetchPrices"]>>>();
  vi.mocked(services.fetchPrices).mockReturnValueOnce(firstLoad.promise);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Revisar", exact: true })).toBeDisabled();

  firstLoad.resolve({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir los precios")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Revisar", exact: true })).toBeDisabled();
});

test.each([
  { filter: "under Por revisar", empty: "Precios al día", search: "" },
  { filter: "for a search", empty: "Sin resultados", search: "zzz" },
])(
  "an empty list $filter shows its empty state and no count line under it",
  async ({ empty, search }) => {
    const services = createServices();
    vi.mocked(services.fetchPrices).mockResolvedValue({
      kind: "ok",
      value: {
        products: [],
        pendingCount: search ? 1 : 0,
        activeProductCount: 3,
        reviewWindowDays: 30,
        categories: [],
      },
    });

    const screen = await renderScreen(services, undefined, {
      filters: pricesListFilters.parse({ search }),
    });

    await expect.element(screen.getByText(empty)).toBeVisible();
    expect(screen.getByText(/\d+ productos?/).query()).toBeNull();
  },
);

test.each([
  {
    applied: "no filter",
    filters: {},
    activeProductCount: 0,
    empty: "No hay productos activos",
    detail: "Creá uno en Productos para ponerle precio.",
    absent: "Sin resultados",
  },
  {
    applied: "a category filter",
    filters: { category: "cat-1" },
    activeProductCount: 3,
    empty: "Sin resultados",
    detail: "Probá con otro nombre o categoría.",
    absent: "No hay productos activos",
  },
  {
    applied: "a search",
    filters: { search: "zzz" },
    activeProductCount: 3,
    empty: "Sin resultados",
    detail: "Probá con otro nombre o categoría.",
    absent: "No hay productos activos",
  },
  {
    applied: "a search and no active products",
    filters: { search: "zzz" },
    activeProductCount: 0,
    empty: "No hay productos activos",
    detail: "Creá uno en Productos para ponerle precio.",
    absent: "Sin resultados",
  },
  {
    applied: "a category filter and no active products",
    filters: { category: "cat-1" },
    activeProductCount: 0,
    empty: "No hay productos activos",
    detail: "Creá uno en Productos para ponerle precio.",
    absent: "Sin resultados",
  },
])(
  "an empty list of every product with $applied shows $empty",
  async ({ filters, activeProductCount, empty, detail, absent }) => {
    const services = createServices();
    vi.mocked(services.fetchPrices).mockResolvedValue({
      kind: "ok",
      value: {
        products: [],
        pendingCount: 0,
        activeProductCount,
        reviewWindowDays: 30,
        categories: [{ id: "cat-1", name: "Almacén" }],
      },
    });

    const screen = await renderScreen(services, undefined, {
      filters: pricesListFilters.parse({ review: "all", ...filters }),
    });

    await expect.element(screen.getByText(empty)).toBeVisible();
    await expect.element(screen.getByText(detail)).toBeVisible();
    expect(screen.getByText(absent).query()).toBeNull();
  },
);

test("a price modal open when the list fails to load closes, and does not open again when the list returns", async () => {
  const services = createServices();
  let listReads = 0;
  vi.mocked(services.fetchPrices).mockImplementation(({ review }) => {
    listReads += review === "pending" ? 1 : 0;
    return Promise.resolve(
      listReads === 2 && review === "pending"
        ? { kind: "failed" }
        : {
            kind: "ok",
            value: {
              products: [rice],
              pendingCount: 1,
              activeProductCount: 3,
              reviewWindowDays: 30,
              categories: [],
            },
          },
    );
  });
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "stale_price" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio nuevo" }));
  await userEvent.click(dialog.getByRole("button", { name: "Recargar el precio" }));

  await expect.element(screen.getByText("No pudimos abrir los precios")).toBeVisible();
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
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
    value: {
      products: [yerbaMate],
      pendingCount: 1,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
  });
  await expect.element(screen.getByText("Yerba")).toBeVisible();
  first.resolve({
    kind: "ok",
    value: {
      products: [rice],
      pendingCount: 1,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
  });
  await screen.commitScheduledUpdates();

  expect(screen.getByText("Arroz").query()).toBeNull();
  await expect.element(screen.getByText("Yerba")).toBeVisible();
});

test("the screen with the price modal open has no accessibility violations", async () => {
  const services = createServices();
  const screen = await openRicePriceModal(services);
  await expect
    .element(screen.getByRole("dialog").getByRole("heading", { name: "Arroz" }))
    .toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});

test("shows a price the cloud reports as reviewed today as reviewed today, not pending", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [{ ...rice, daysSinceReview: 0, pending: false }],
      pendingCount: 0,
      activeProductCount: 1,
      reviewWindowDays: 30,
      categories: [],
    },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Hoy", { exact: true })).toBeVisible();
  expect(screen.getByRole("button", { name: /^Revisar/ }).query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio de Arroz" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("Revisado hoy")).toBeVisible();
  expect(dialog.getByText("Sin revisar", { exact: false }).query()).toBeNull();
});

test("shows the review age the cloud reports for each product", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [rice, { ...yerbaMate, daysSinceReview: 1, pending: false }],
      pendingCount: 1,
      activeProductCount: 2,
      reviewWindowDays: 30,
      categories: [],
    },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Hace 40 días")).toBeVisible();
  await expect.element(screen.getByText("Hace 1 día", { exact: true })).toBeVisible();
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
      value: {
        products: [rice],
        pendingCount: 1,
        activeProductCount: 3,
        reviewWindowDays: 30,
        categories: [],
      },
    })
    .mockRejectedValue(new Error("network down"));

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Revisión: Por revisar" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));

  await expect.element(screen.getByText("No pudimos abrir los precios")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("a product the price modal finds no longer exists keeps the modal open and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "not_found" });
  const screen = await openRicePriceModal(services);
  const loadsBefore = vi.mocked(services.fetchPrices).mock.calls.length;

  await userEvent.click(screen.getByRole("button", { name: "Confirmar sin cambios" }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Producto desactivado");
  await expect.element(dialog.getByRole("heading", { name: "Arroz" })).toBeVisible();
  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.length)
    .toBeGreaterThan(loadsBefore);
});
