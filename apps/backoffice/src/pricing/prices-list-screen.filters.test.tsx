import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { pricesListFilters } from "./routes";
import {
  createServices,
  groceries,
  NOW,
  renderScreen,
  rice,
  screenElement,
  withoutPrice,
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

  await userEvent.click(screen.getByRole("button", { name: "Categoría: Todas" }));

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

  const screen = await renderScreen(services, () => {}, NOW, {
    filters: { search: " arroz ", category: groceries.id, review: "all" },
  });

  await expect.element(screen.getByText("Arroz")).toBeVisible();
  expect(services.fetchPrices).toHaveBeenNthCalledWith(1, {
    review: "all",
    categoryId: groceries.id,
    search: "arroz",
  });
  await expect.element(screen.getByPlaceholder("Buscar un producto")).toHaveValue(" arroz ");
  await expect.element(screen.getByRole("button", { name: "Categoría: Almacén" })).toBeVisible();
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

  const screen = await renderScreen(services, () => {}, NOW, {
    filters: { ...pricesListFilters.parse({}), category: "deleted-category" },
    onFiltersChange,
  });

  await expect.element(screen.getByRole("button", { name: "Categoría: Todas" })).toBeVisible();
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
  const screen = await renderScreen(services, () => {}, NOW, { onFiltersChange });
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
  const screen = await renderScreen(services, () => {}, NOW, { filters, onFiltersChange });
  await expect.element(screen.getByText("Arroz")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Revisión: Por revisar" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));
  await expect.poll(() => onFiltersChange.mock.calls.length).toBe(1);

  await screen.rerender(
    screenElement(services, () => {}, NOW, {
      filters,
      onFiltersChange: (reported) => onFiltersChange(reported),
    }),
  );

  expect(onFiltersChange).toHaveBeenCalledTimes(1);
});
