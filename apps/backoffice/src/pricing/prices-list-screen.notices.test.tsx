import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { PricesListScreenServices } from "./prices-list-services";
import {
  createServices,
  deferred,
  groceries,
  renderScreen,
  rice,
  yerbaMate,
} from "./test-support/prices-list-screen";

test("confirming a priced product's price without a change shows a confirmed notice and refreshes the list", async () => {
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
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "ok" });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
  );

  expect(services.confirmPrice).toHaveBeenCalledWith("product-2", {
    expectedCurrentPriceId: "00000000-0000-4000-8000-000000000001",
  });
  await expect.element(screen.getByText("Precio confirmado")).toBeVisible();
  await expect.element(screen.getByText("Arroz sigue a $ 7.500,00 / kg.")).toBeVisible();
  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.length)
    .toBeGreaterThanOrEqual(2);
});

test("confirming a row whose product no longer exists names it in the screen's notice", async () => {
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
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "not_found" });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
  );

  await expect.element(screen.getByText("Producto desactivado")).toBeVisible();
  await expect.element(screen.getByText("Arroz ya no está en el catálogo.")).toBeVisible();
});

test.each([
  {
    outcome: { kind: "stale_price" as const },
    title: "El precio cambió recién",
    description: "Revisá el precio actual de Arroz.",
  },
  {
    outcome: { kind: "rate_limited" as const, retryAfterSeconds: 60 },
    title: "Demasiadas solicitudes",
    description: "Se puede volver a intentar en 1 minuto.",
  },
  {
    outcome: { kind: "failed" as const },
    title: "No se pudo confirmar el precio de Arroz",
    description: "Probá de nuevo.",
  },
])(
  "a row confirm that ends in $outcome.kind shows its notice on the screen, whether or not the list has reloaded yet",
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
      .mockReturnValue(new Promise(() => {}));
    vi.mocked(services.confirmPrice).mockResolvedValue(outcome);

    const screen = await renderScreen(services);
    await expect.element(screen.getByText("Arroz")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
    );

    await expect.element(screen.getByText(title)).toBeVisible();
    await expect.element(screen.getByText(description)).toBeVisible();
  },
);

test("a row confirmation that throws shows its failure notice and re-enables the row actions", async () => {
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

test("a row confirmation that finds no open session ends the session", async () => {
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
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  const screen = await renderScreen(services, onSessionEnded);
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
  );

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("a row confirmation answered forbidden navigates to Mi cuenta", async () => {
  window.history.pushState(null, "", "/prices");
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
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "forbidden" });

  const screen = await renderScreen(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar el precio de Arroz sin cambios" }),
  );

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});

test("an error notice does not leave with time, only with the person's next action", async () => {
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
  vi.mocked(services.confirmPrice)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue({ kind: "ok" });
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
    value: {
      products: [rice],
      pendingCount: 1,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
  });
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "ok" });
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
    value: {
      products: [rice],
      pendingCount: 1,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
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

test("a row confirmation answered that there is no price to confirm reloads the list and names the product", async () => {
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
        products: [{ ...rice, currentPrice: null, secondsSinceReview: null }],
        pendingCount: 1,
        activeProductCount: 3,
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

async function showRowConfirmFailure(services: PricesListScreenServices) {
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [rice],
      pendingCount: 1,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [groceries],
    },
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
      value: {
        products: [rice],
        pendingCount: 1,
        activeProductCount: 3,
        reviewWindowDays: 30,
        categories: [],
      },
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
        products: [rice],
        pendingCount: 3,
        activeProductCount: 3,
        reviewWindowDays: 30,
        categories: [],
      },
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

    await expect
      .poll(() => {
        vi.advanceTimersByTime(1);
        return screen.getByRole("button", { name: "Revisar los 3" }).query();
      })
      .not.toBeNull();
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
    value: {
      products: [rice],
      pendingCount: 1,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
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
