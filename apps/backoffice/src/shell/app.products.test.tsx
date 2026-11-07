import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/help",
  "/products",
  "/products/assemblies",
  "/products/assemblies/batches",
  "/products/classification",
  "/products/classification/brands",
  "/products/classification/tags",
  "/products/prices",
  "/products/promotions",
]);

beforeEach(resetPageState);

const EVERY_PRODUCT_CAPABILITY: Capability[] = [
  "products_and_categories",
  "prices_area",
  "promotions",
  "recipes",
  "batches",
];

const TAB_NAMES = ["Productos", "Precios", "Promociones", "Armados", "Clasificación"];

function productsServices(capabilities: Capability[]) {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Villalba",
        isAdministrator: false,
        capabilities,
      }),
    ),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  return services;
}

function location() {
  return window.location.pathname + window.location.search;
}

function railLink(screen: Awaited<ReturnType<typeof render>>) {
  return screen.getByRole("navigation", { name: "Áreas" }).getByRole("link", { name: "Productos" });
}

test("opens Productos from the rail with its five tabs for a person with every catalog capability", async () => {
  const services = productsServices(EVERY_PRODUCT_CAPABILITY);
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(railLink(screen));

  await expect.element(screen.getByRole("heading", { name: "Productos", level: 1 })).toBeVisible();
  expect(location()).toBe("/products");
  expect(document.title).toBe("Productos · Puro Sur");
  const tabs = screen.getByRole("tablist", { name: "Secciones de Productos" });
  await expect.element(tabs.getByRole("tab", { name: "Productos", selected: true })).toBeVisible();
  for (const [index, name] of TAB_NAMES.entries()) {
    await expect.element(tabs.getByRole("tab").nth(index)).toHaveAccessibleName(name);
  }
  await expect.element(railLink(screen)).toHaveAttribute("aria-current", "page");
  await expect
    .element(
      screen
        .getByRole("navigation", { name: "Productos" })
        .getByRole("link", { name: "Productos" }),
    )
    .toHaveAttribute("aria-current", "page");
});

test("has no Catálogo item in the rail", async () => {
  const services = productsServices(EVERY_PRODUCT_CAPABILITY);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(railLink(screen)).toBeVisible();
  expect(screen.getByRole("link", { name: "Catálogo" }).query()).toBeNull();
});

test("hides the Productos item in the rail for a user without a product capability", async () => {
  const services = productsServices(["catalog_area", "stock_area", "stock_balances"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(railLink(screen).query()).toBeNull();
});

test.each([
  ["promotions", "/products/promotions", "Promociones"],
  ["prices_area", "/products/prices", "Precios"],
  ["recipes", "/products/assemblies", "Armados"],
] as const)(
  "opens only the tab of %s, as the default, from the rail's Productos item",
  async (capability, path, tab) => {
    const services = productsServices([capability]);
    window.history.pushState(null, "", "/help");
    const screen = await render(<App help={emptyHelp} services={services} />);

    await userEvent.click(railLink(screen));

    await expect.element(screen.getByRole("tab", { name: tab, selected: true })).toBeVisible();
    expect(location()).toBe(path);
    expect(screen.getByRole("tab", { name: "Productos" }).query()).toBeNull();
    expect(screen.getByRole("tab", { name: "Clasificación" }).query()).toBeNull();
  },
);

test("shows only Promociones to a person with only promotions", async () => {
  const services = productsServices(["promotions"]);
  window.history.pushState(null, "", "/products");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "Promociones", selected: true }))
    .toBeVisible();
  expect(screen.getByRole("tab").elements()).toHaveLength(1);
  expect(location()).toBe("/products/promotions");
  expect(services.productsListScreen.fetchProducts).not.toHaveBeenCalled();
});

test.each([
  ["/products/promotions", ["prices_area"], "Precios", "/products/prices"],
  ["/products/prices", ["promotions"], "Promociones", "/products/promotions"],
  ["/products/classification", ["prices_area"], "Precios", "/products/prices"],
  ["/products/assemblies", ["products_and_categories"], "Productos", "/products"],
] as const)(
  "sends a person who opens %s without its capability to the first tab they see",
  async (path, capabilities, tab, target) => {
    const services = productsServices([...capabilities]);
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("tab", { name: tab, selected: true })).toBeVisible();
    expect(location()).toBe(target);
  },
);

test.each([
  "/products",
  "/products/prices",
  "/products/promotions",
  "/products/assemblies",
  "/products/classification",
  "/categories",
  "/prices",
  "/discounts",
  "/recipes",
])(
  "sends a person with no product capability who opens %s to the own account panel",
  async (path) => {
    const services = productsServices(["refunds_area"]);
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
    expect(location()).toBe("/?account=credentials");
    expect(services.productsListScreen.fetchProducts).not.toHaveBeenCalled();
    expect(services.pricesListScreen.fetchPrices).not.toHaveBeenCalled();
    expect(services.discountsListScreen.fetchDiscounts).not.toHaveBeenCalled();
    expect(services.recipesListScreen.fetchRecipes).not.toHaveBeenCalled();
    expect(services.categoriesListScreen.fetchCategories).not.toHaveBeenCalled();
  },
);

test.each([
  ["/categories?search=alma", ["products_and_categories"], "/products/classification?search=alma"],
  ["/brands", ["products_and_categories"], "/products/classification/brands"],
  ["/tags", ["products_and_categories"], "/products/classification/tags"],
  ["/prices?search=yerba&review=all", ["prices_area"], "/products/prices?review=all&search=yerba"],
  [
    "/discounts?search=yerba&status=all",
    ["promotions"],
    "/products/promotions?search=yerba&status=all",
  ],
  ["/recipes", ["recipes"], "/products/assemblies"],
  ["/assembly-batches", ["recipes", "batches"], "/products/assemblies/batches"],
] as const)(
  "redirects the old address %s to its tab or section",
  async (old, capabilities, target) => {
    const services = productsServices([...capabilities]);
    window.history.pushState(null, "", old);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect
      .element(screen.getByRole("heading", { name: "Productos", level: 1 }))
      .toBeVisible();
    expect(location()).toBe(target);
  },
);

test("opens Clasificación with its three sections, each one at its own address", async () => {
  const services = productsServices(["products_and_categories"]);
  vi.mocked(services.categoriesListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.brandsListScreen.fetchBrands).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/products/classification");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "Clasificación", selected: true }))
    .toBeVisible();
  const sections = screen.getByRole("tablist", { name: "Secciones de Clasificación" });
  await expect
    .element(sections.getByRole("tab", { name: "Categorías", selected: true }))
    .toBeVisible();
  for (const [index, name] of ["Categorías", "Marcas", "Distintivos"].entries()) {
    await expect.element(sections.getByRole("tab").nth(index)).toHaveAccessibleName(name);
  }
  expect(screen.getByRole("heading", { name: "Categorías", level: 1 }).query()).toBeNull();

  await userEvent.click(sections.getByRole("tab", { name: "Marcas" }));

  await expect.element(sections.getByRole("tab", { name: "Marcas", selected: true })).toBeVisible();
  expect(location()).toBe("/products/classification/brands");
  await expect.poll(() => services.brandsListScreen.fetchBrands).toHaveBeenCalled();
});

test("opens Armados with Recetas and, for who may register batches, Tandas", async () => {
  const services = productsServices(["recipes", "batches"]);
  vi.mocked(services.recipesListScreen.fetchRecipes).mockResolvedValue({
    kind: "ok",
    value: { recipes: [], products: [] },
  });
  vi.mocked(services.assemblyBatchesScreen.fetchAssemblyBatches).mockResolvedValue({
    kind: "ok",
    value: { batches: [], recipes: [] },
  });
  window.history.pushState(null, "", "/products/assemblies");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const sections = screen.getByRole("tablist", { name: "Secciones de Armados" });
  await expect
    .element(sections.getByRole("tab", { name: "Recetas", selected: true }))
    .toBeVisible();

  await userEvent.click(sections.getByRole("tab", { name: "Tandas" }));

  await expect.element(sections.getByRole("tab", { name: "Tandas", selected: true })).toBeVisible();
  expect(location()).toBe("/products/assemblies/batches");
  await expect.poll(() => services.assemblyBatchesScreen.fetchAssemblyBatches).toHaveBeenCalled();
});

test("offers no Tandas to a person who may not register batches, and sends them back to Recetas", async () => {
  const services = productsServices(["recipes"]);
  vi.mocked(services.recipesListScreen.fetchRecipes).mockResolvedValue({
    kind: "ok",
    value: { recipes: [], products: [] },
  });
  window.history.pushState(null, "", "/products/assemblies/batches");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Armados", selected: true })).toBeVisible();
  expect(location()).toBe("/products/assemblies");
  expect(screen.getByRole("tab", { name: "Tandas" }).query()).toBeNull();
  expect(services.assemblyBatchesScreen.fetchAssemblyBatches).not.toHaveBeenCalled();
});

test("walks the prices of a purchase just registered in Precios, on Por revisar, taking them from the page so a reload does not walk them again", async () => {
  const services = productsServices(["prices_area"]);
  vi.mocked(services.pricesListScreen.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [
        {
          id: "product-1",
          name: "Fideos",
          categoryId: "category-1",
          categoryName: "Almacén",
          brandName: null,
          netContent: null,
          saleUnit: "UNIT",
          currentPrice: null,
          secondsSinceReview: null,
          pending: true,
          costReference: null,
        },
      ],
      pendingCount: 1,
      activeProductCount: 1,
      reviewWindowDays: 30,
      categories: [],
    },
  });
  window.history.pushState(
    { key: "purchased", __TSR_index: 0, purchasedProductsToReview: ["product-1"] },
    "",
    "/products/prices",
  );

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Fideos" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Revisión: Por revisar" })).toBeVisible();
  expect(services.pricesListScreen.fetchPrices).toHaveBeenCalledWith({
    review: "pending",
    productIds: ["product-1"],
  });
  await expect
    .poll(() => window.history.state)
    .not.toMatchObject({ purchasedProductsToReview: ["product-1"] });
  expect(location()).toBe("/products/prices");
});

test("lists the promotions and opens Nueva promoción for a user holding only manage_promotions", async () => {
  const services = productsServices(["promotions"]);
  vi.mocked(services.discountsListScreen.fetchDiscounts).mockResolvedValue({
    kind: "ok",
    value: {
      discounts: [
        {
          id: "0b1f3c1e-4f6a-4d0e-9d6e-000000000001",
          name: "Yerba de septiembre",
          benefit: { kind: "PERCENT_OFF", percent: 15 },
          target: {
            kind: "PRODUCT",
            id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000101",
            name: "Yerba",
            brandName: null,
            netContent: null,
          },
          validFrom: "2026-09-12",
          validTo: "2026-09-30",
          weekdays: [],
          active: true,
          version: 1,
          status: "current",
        },
      ],
    },
  });
  window.history.pushState(null, "", "/products/promotions");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-20T15:00:00.000Z"));
  try {
    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByText("Yerba de septiembre")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Nueva promoción" }));
    await expect.element(screen.getByRole("dialog", { name: "Nueva promoción" })).toBeVisible();
    expect(location()).toBe("/products/promotions");
  } finally {
    vi.useRealTimers();
  }
});
