import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  createServices,
  expectRowActionsDisabled,
  renderScreen,
  rice,
  withoutPrice,
  yerbaMate,
} from "./test-support/prices-list-screen";

test("Revisar los N walks the pending products one by one, opening the next after each save", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockImplementation(async () => ({
    kind: "ok",
    value: {
      products: [withoutPrice, rice],
      pendingCount: 2,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
  }));
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "ok" });

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
    value: {
      products: [withoutPrice, rice],
      pendingCount: 2,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
  }));
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "ok" });

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

test("Revisar los N moves past a product that no longer exists, naming it on the next one, and ends when none is left", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockImplementation(async () => ({
    kind: "ok",
    value: {
      products: [withoutPrice, rice],
      pendingCount: 2,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
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

test("while Revisar los N is loading the pending products, no row action can start", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: {
        products: [rice, yerbaMate],
        pendingCount: 2,
        activeProductCount: 3,
        reviewWindowDays: 30,
        categories: [],
      },
    })
    .mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Revisar los 2" }));

  await expectRowActionsDisabled(screen);
});

test("a Revisar los N read that throws shows a notice, keeps the table and re-enables the row actions", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce({
      kind: "ok",
      value: {
        products: [rice, yerbaMate],
        pendingCount: 2,
        activeProductCount: 3,
        reviewWindowDays: 30,
        categories: [],
      },
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
    value: {
      products: [],
      pendingCount: 0,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
  };
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
          value: {
            products: [],
            pendingCount: 0,
            activeProductCount: 3,
            reviewWindowDays: 15,
            categories: [],
          },
        }
      : {
          kind: "ok",
          value: {
            products: [rice],
            pendingCount: 1,
            activeProductCount: 3,
            reviewWindowDays: 15,
            categories: [],
          },
        },
  );
  vi.mocked(services.fetchPrices).mockResolvedValueOnce({
    kind: "ok",
    value: {
      products: [rice],
      pendingCount: 1,
      activeProductCount: 3,
      reviewWindowDays: 15,
      categories: [],
    },
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
    description: "Probá de nuevo.",
  },
  {
    outcome: { kind: "rate_limited" as const, retryAfterSeconds: 120 },
    title: "Demasiadas solicitudes",
    description: "Se puede volver a intentar en 2 minutos.",
  },
])(
  "a Revisar los N read that ends in $outcome.kind keeps the table and shows its notice",
  async ({ outcome, title, description }) => {
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
      .mockResolvedValueOnce(outcome);

    const screen = await renderScreen(services);
    await userEvent.click(screen.getByRole("button", { name: "Revisar 1" }));

    await expect.element(screen.getByText(title)).toBeVisible();
    await expect.element(screen.getByText(description)).toBeVisible();
    await expect.element(screen.getByText("Arroz")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reintentar" }).query()).toBeNull();
  },
);
