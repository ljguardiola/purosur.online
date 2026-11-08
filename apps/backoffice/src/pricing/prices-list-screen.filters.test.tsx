import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { withReadsCounted } from "../platform/test-support/reads-counted";
import type { PricesListScreenServices } from "./prices-list-services";
import { pricesListFilters } from "./routes";
import {
  createServices,
  deferred,
  groceries,
  renderScreen,
  rice,
  screenElement,
  withoutPrice,
  yerbaMate,
} from "./test-support/prices-list-screen";

test("the search field re-fetches with the typed search term", async () => {
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
    value: {
      products: [rice, withoutPrice],
      pendingCount: 2,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Revisión: Por revisar" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));

  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.calls.some((call) => call[0].review === "all"))
    .toBe(true);
});

test("the review filter offers the overdue prices, asking the cloud for review=overdue", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [rice],
      pendingCount: 2,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
  });
  const onFiltersChange = vi.fn();

  const screen = await renderScreen(services, () => {}, { onFiltersChange });
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Revisión: Por revisar" }));
  await expect.element(screen.getByRole("option", { name: "Vencidos" })).toBeVisible();
  await userEvent.click(screen.getByRole("option", { name: "Vencidos" }));

  await expect
    .poll(() =>
      vi.mocked(services.fetchPrices).mock.calls.some((call) => call[0].review === "overdue"),
    )
    .toBe(true);
  expect(onFiltersChange).toHaveBeenLastCalledWith({
    search: "",
    category: "ALL",
    review: "overdue",
  });
});

test("the category filter offers the categories the prices list brings and narrows the request by categoryId", async () => {
  const services = createServices();
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

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.click(screen.getByRole("combobox", { name: /^Categoría:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Almacén" }));

  await expect
    .poll(() =>
      vi
        .mocked(services.fetchPrices)
        .mock.calls.some((call) => call[0].categoryId === "category-1"),
    )
    .toBe(true);
});

test("the category filter lists the categories alphabetically by name", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [rice],
      pendingCount: 1,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [
        { id: "category-3", name: "Verdulería" },
        groceries,
        { id: "category-2", name: "Bebidas" },
      ],
    },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.click(screen.getByRole("combobox", { name: /^Categoría:/ }));

  await expect
    .poll(() =>
      screen
        .getByRole("option")
        .all()
        .map((option) => option.element().textContent ?? ""),
    )
    .toEqual(["Todas", "Almacén", "Bebidas", "Verdulería"]);
});

test("opens with the filters it is given, asking for them in its first request", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [rice],
      pendingCount: 0,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [groceries],
    },
  });

  const screen = await renderScreen(services, () => {}, {
    filters: { search: " arroz ", category: groceries.id, review: "all" },
  });

  await expect.element(screen.getByText("Arroz")).toBeVisible();
  expect(services.fetchPrices).toHaveBeenNthCalledWith(1, {
    review: "all",
    categoryId: groceries.id,
    search: "arroz",
  });
  await expect.element(screen.getByPlaceholder("Buscar un producto")).toHaveValue(" arroz ");
  await expect
    .element(screen.getByRole("combobox", { name: /^Categoría:/ }))
    .toHaveValue("Almacén");
  await expect.element(screen.getByRole("button", { name: "Revisión: Todos" })).toBeVisible();
});

test("falls back to every category when the category it is given is not one the list offers", async () => {
  const services = createServices();
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
  const onFiltersChange = vi.fn();

  const screen = await renderScreen(services, () => {}, {
    filters: { ...pricesListFilters.parse({}), category: "deleted-category" },
    onFiltersChange,
  });

  await expect.element(screen.getByRole("combobox", { name: /^Categoría:/ })).toHaveValue("Todas");
  await expect
    .poll(() => vi.mocked(services.fetchPrices).mock.lastCall?.[0])
    .toEqual({
      review: "pending",
    });
  expect(onFiltersChange).toHaveBeenLastCalledWith(pricesListFilters.parse({}));
});

test("reports every change to its filters, so they can be kept for a reload", async () => {
  const services = createServices();
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
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, () => {}, { onFiltersChange });
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Revisión: Por revisar" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));
  await userEvent.fill(screen.getByPlaceholder("Buscar un producto"), "arr");

  expect(onFiltersChange).toHaveBeenLastCalledWith({
    search: "arr",
    category: "ALL",
    review: "all",
  });
});

test("does not report its filters again when the route hands it a new callback", async () => {
  const services = createServices();
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
  const onFiltersChange = vi.fn();
  const filters = pricesListFilters.parse({});
  const screen = await renderScreen(services, () => {}, { filters, onFiltersChange });
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Revisión: Por revisar" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));
  await expect.poll(() => onFiltersChange.mock.calls.length).toBe(1);

  await screen.rerender(
    screenElement(services, () => {}, {
      filters,
      onFiltersChange: (reported) => onFiltersChange(reported),
    }),
  );

  expect(onFiltersChange).toHaveBeenCalledTimes(1);
});

test("a chosen category keeps its name in the filter while the list it narrows failed to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockImplementation(async (input) =>
    input.categoryId
      ? { kind: "failed" }
      : {
          kind: "ok",
          value: {
            products: [rice],
            pendingCount: 1,
            activeProductCount: 3,
            reviewWindowDays: 30,
            categories: [groceries],
          },
        },
  );

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.click(screen.getByRole("combobox", { name: /^Categoría:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Almacén" }));
  await expect.element(screen.getByText("No pudimos abrir los precios")).toBeVisible();

  await expect
    .element(screen.getByRole("combobox", { name: /^Categoría:/ }))
    .toHaveValue("Almacén");
});

test("retrying a list narrowed by a chosen category loads it again from its placeholder, keeping the category's name", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<PricesListScreenServices["fetchPrices"]>>>();
  vi.mocked(services.fetchPrices).mockImplementation(async (input) =>
    input.categoryId
      ? { kind: "failed" }
      : {
          kind: "ok",
          value: {
            products: [rice],
            pendingCount: 1,
            activeProductCount: 3,
            reviewWindowDays: 30,
            categories: [groceries],
          },
        },
  );
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(screen.getByRole("combobox", { name: /^Categoría:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Almacén" }));
  await expect.element(screen.getByText("No pudimos abrir los precios")).toBeVisible();
  vi.mocked(services.fetchPrices).mockReturnValueOnce(retry.promise);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("No pudimos abrir los precios")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Arroz")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
  await expect
    .element(screen.getByRole("combobox", { name: /^Categoría:/ }))
    .toHaveValue("Almacén");
  retry.resolve({
    kind: "ok",
    value: {
      products: [rice],
      pendingCount: 1,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [groceries],
    },
  });
  await expect.element(screen.getByText("Arroz")).toBeVisible();
});

test("typing in the category filter offers only the matching categories", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [rice],
      pendingCount: 1,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [
        { id: "category-3", name: "Verdulería" },
        groceries,
        { id: "category-2", name: "Bebidas" },
      ],
    },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  await userEvent.fill(screen.getByRole("combobox", { name: /Categoría/ }), "verd");

  expect(
    screen
      .getByRole("option")
      .all()
      .map((option) => option.element().textContent),
  ).toEqual(["Verdulería"]);
});

test("the footer count uses the thousands separator for both review filters", async () => {
  const services = createServices();
  const manyProducts = Array.from({ length: 1000 }, (_, index) => ({
    ...rice,
    id: `product-${index}`,
    name: `Arroz ${index}`,
  }));
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: manyProducts,
      pendingCount: 1000,
      activeProductCount: 1000,
      reviewWindowDays: 30,
      categories: [],
    },
  });

  const screen = await renderScreen(services);
  await expect
    .element(screen.getByText("1.000 productos sin revisar, del más viejo al más nuevo"))
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Revisión: Por revisar" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));
  await expect.element(screen.getByText("1.000 productos")).toBeVisible();
});

test("typing in the search renders none of the listed products again, while each letter reaches the URL", async () => {
  const services = createServices();
  const listed = withReadsCounted([rice, yerbaMate], "name");
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: listed.items,
      pendingCount: 0,
      activeProductCount: 2,
      reviewWindowDays: 30,
      categories: [],
    },
  });
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, undefined, {
    filters: pricesListFilters.parse({ review: "all" }),
    onFiltersChange,
  });
  await expect.element(screen.getByText("Yerba")).toBeVisible();

  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    listed.resetReads();

    await userEvent.type(screen.getByPlaceholder("Buscar un producto"), "arr");

    await expect.element(screen.getByPlaceholder("Buscar un producto")).toHaveValue("arr");
    expect(onFiltersChange.mock.calls.map(([filters]) => filters.search)).toEqual([
      "a",
      "ar",
      "arr",
    ]);
    expect(listed.reads()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
