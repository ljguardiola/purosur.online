import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { productPanelSections } from "../catalog/test-support/product-panel-sections";
import { almonds, honey } from "../catalog/test-support/products";
import { mockLoaded } from "../catalog/test-support/products-list-screen";
import { openSession } from "../sessions/test-support/open-session";
import { assemblyBatchList, mixBatch } from "../stock/test-support/assembly-batches";
import { almendras, cajaDeInfusiones, mixDeFrutosSecos } from "../stock/test-support/recipes";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { shownEyebrow } from "./test-support/eyebrow";
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
  "catalog_area",
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
  expect(shownEyebrow()).toBeNull();
  const tabs = screen.getByRole("tablist", { name: "Secciones de Productos" });
  await expect.element(tabs.getByRole("tab", { name: "Productos", selected: true })).toBeVisible();
  for (const [index, name] of TAB_NAMES.entries()) {
    await expect.element(tabs.getByRole("tab").nth(index)).toHaveAccessibleName(name);
  }
  await expect.element(railLink(screen)).toHaveAttribute("aria-current", "page");
});

test("shows the page's title with neither an eyebrow nor a section column repeating it", async () => {
  const services = productsServices(EVERY_PRODUCT_CAPABILITY);
  window.history.pushState(null, "", "/products");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const title = screen.getByRole("heading", { name: "Productos", level: 1 });
  await expect.element(title).toBeVisible();
  expect(title.element().previousElementSibling).toBeNull();
  expect(screen.getByRole("navigation", { name: "Productos" }).query()).toBeNull();
  expect(screen.getByRole("heading", { name: "Productos" }).elements()).toHaveLength(1);
});

test("shows no Catálogo section column with links to the sections it used to list", async () => {
  const services = productsServices(EVERY_PRODUCT_CAPABILITY);
  window.history.pushState(null, "", "/products");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Productos", level: 1 })).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Catálogo" }).query()).toBeNull();
  for (const section of ["Categorías", "Marcas", "Etiquetas", "Precios", "Promociones"]) {
    expect(screen.getByRole("link", { name: section }).query()).toBeNull();
  }
});

test("has no Catálogo item in the rail", async () => {
  const services = productsServices(EVERY_PRODUCT_CAPABILITY);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(railLink(screen)).toBeVisible();
  expect(screen.getByRole("link", { name: "Catálogo" }).query()).toBeNull();
});

test("hides the Productos item in the rail for a user without a product capability", async () => {
  const services = productsServices(["stock_area", "stock_balances"]);
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
    const services = productsServices([capability, "catalog_area"]);
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
  const services = productsServices(["promotions", "catalog_area"]);
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
    const services = productsServices([...capabilities, "catalog_area"]);
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
  ["/prices?review=overdue", ["prices_area"], "/products/prices?review=overdue"],
  [
    "/discounts?search=yerba&status=all",
    ["promotions"],
    "/products/promotions?search=yerba&status=all",
  ],
  ["/recipes", ["recipes"], "/products/assemblies"],
  ["/assembly-batches", ["recipes", "batches"], "/products/assemblies/batches"],
  ["/assembly-batches", ["batches"], "/products/assemblies/batches"],
  ["/assembly-batches", ["recipes"], "/products/assemblies"],
  ["/products/assemblies/batches", ["recipes"], "/products/assemblies"],
  ["/products/assemblies", ["batches"], "/products/assemblies/batches"],
] as const)(
  "redirects the old address %s to its tab or section",
  async (old, capabilities, target) => {
    const services = productsServices([...capabilities, "catalog_area"]);
    window.history.pushState(null, "", old);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect
      .element(screen.getByRole("heading", { name: "Productos", level: 1 }))
      .toBeVisible();
    expect(location()).toBe(target);
  },
);

test("opens Clasificación with its three sections, each one at its own address", async () => {
  const services = productsServices(["products_and_categories", "catalog_area"]);
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
  for (const [index, name] of ["Categorías", "Marcas", "Etiquetas"].entries()) {
    await expect.element(sections.getByRole("tab").nth(index)).toHaveAccessibleName(name);
  }
  expect(screen.getByRole("heading", { name: "Categorías", level: 1 }).query()).toBeNull();

  await userEvent.click(sections.getByRole("tab", { name: "Marcas" }));

  await expect.element(sections.getByRole("tab", { name: "Marcas", selected: true })).toBeVisible();
  expect(location()).toBe("/products/classification/brands");
  await expect.poll(() => services.brandsListScreen.fetchBrands).toHaveBeenCalled();
});

test("editing a brand in Clasificación is a modal and the list stays visible", async () => {
  const services = productsServices(["products_and_categories", "catalog_area"]);
  vi.mocked(services.brandsListScreen.fetchBrands).mockResolvedValue({
    kind: "ok",
    value: [
      { id: "brand-1", name: "Granuz", active: true, version: 1, productCount: 42 },
      { id: "brand-2", name: "Vitora", active: true, version: 2, productCount: 18 },
    ],
  });
  window.history.pushState(null, "", "/products/classification/brands");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("table", { name: "Marcas" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar la marca Granuz" }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("Granuz");
  await expect.element(screen.getByRole("table", { name: "Marcas" })).toBeVisible();
  await expect.element(screen.getByText("Vitora")).toBeVisible();
  expect(location()).toBe("/products/classification/brands");
});

function armadosServices(capabilities: Capability[]) {
  const services = productsServices([...capabilities, "catalog_area"]);
  vi.mocked(services.recipesListScreen.fetchRecipes).mockResolvedValue({
    kind: "ok",
    value: { recipes: [mixDeFrutosSecos, cajaDeInfusiones], products: [] },
  });
  vi.mocked(services.assemblyBatchesScreen.fetchAssemblyBatches).mockResolvedValue({
    kind: "ok",
    value: assemblyBatchList([mixBatch]),
  });
  return services;
}

test("opens Armados on Recetas, with a Producciones section beside it for a person with batches", async () => {
  const services = armadosServices(["recipes", "batches"]);
  window.history.pushState(null, "", "/products/assemblies");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("table", { name: "Recetas" })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Recetas", selected: true })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Producciones" })).toBeVisible();
  expect(services.assemblyBatchesScreen.fetchAssemblyBatches).not.toHaveBeenCalled();
});

test("shows the batches in the Producciones section", async () => {
  const services = armadosServices(["recipes", "batches"]);
  window.history.pushState(null, "", "/products/assemblies");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("table", { name: "Recetas" })).toBeVisible();

  await userEvent.click(screen.getByRole("tab", { name: "Producciones" }));

  await expect.element(screen.getByRole("table", { name: "Producciones" })).toBeVisible();
  expect(location()).toBe("/products/assemblies/batches");
});

test("opens Armados with only its Producciones section, and without Recetas, for a person with only batches", async () => {
  const services = armadosServices(["batches"]);
  window.history.pushState(null, "", "/products");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("table", { name: "Producciones" })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Armados", selected: true })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Recetas" }).query()).toBeNull();
  expect(screen.getByRole("tab", { name: "Producciones" }).query()).toBeNull();
  expect(location()).toBe("/products/assemblies/batches");
  expect(services.recipesListScreen.fetchRecipes).not.toHaveBeenCalled();
});

test("opens Armados as the recipes alone, without a Producciones section, for a person with only recipes", async () => {
  const services = armadosServices(["recipes"]);
  window.history.pushState(null, "", "/products/assemblies");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("table", { name: "Recetas" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Producciones" }).query()).toBeNull();
  expect(services.assemblyBatchesScreen.fetchAssemblyBatches).not.toHaveBeenCalled();
});

test("a row of Armados opens the recipe's panel with its batches, and the recipe stays in the address", async () => {
  const services = armadosServices(["recipes", "batches"]);
  window.history.pushState(null, "", "/products/assemblies");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByText("Mix de frutos secos"));

  const panel = screen.getByRole("complementary", { name: "Mix de frutos secos" });
  await expect.element(panel.getByText("15/09/2026")).toBeVisible();
  expect(location()).toBe(`/products/assemblies?recipe=${mixDeFrutosSecos.productId}`);
  await expect.element(panel.getByRole("button", { name: "Registrar producción" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  await expect.poll(() => screen.getByRole("complementary").query()).toBeNull();
  expect(location()).toBe("/products/assemblies");
});

test("opens the panel of the recipe named in the address of Armados", async () => {
  const services = armadosServices(["recipes", "batches"]);
  window.history.pushState(null, "", `/products/assemblies?recipe=${mixDeFrutosSecos.productId}`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("complementary", { name: "Mix de frutos secos" }))
    .toBeVisible();
});

test("keeps the panel of Armados open while the list's search changes", async () => {
  const services = armadosServices(["recipes", "batches"]);
  window.history.pushState(null, "", `/products/assemblies?recipe=${mixDeFrutosSecos.productId}`);
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("complementary")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar un producto armado"), "mix");

  await expect
    .poll(location)
    .toBe(`/products/assemblies?recipe=${mixDeFrutosSecos.productId}&search=mix`);
  await expect.element(screen.getByRole("complementary")).toBeVisible();
});

test("ignores a recipe that is not a text in the address of Armados", async () => {
  const services = armadosServices(["recipes"]);
  window.history.pushState(null, "", "/products/assemblies?recipe=7");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("table", { name: "Recetas" })).toBeVisible();
  expect(screen.getByRole("complementary").query()).toBeNull();
});

test("a person without batches sees the recipe in its panel without its batches, and stays on Armados", async () => {
  const services = armadosServices(["recipes"]);
  vi.mocked(services.assemblyBatchesScreen.fetchAssemblyBatches).mockResolvedValue({
    kind: "forbidden",
  });
  const address = `/products/assemblies?recipe=${mixDeFrutosSecos.productId}`;
  window.history.pushState(null, "", address);

  const screen = await render(<App help={emptyHelp} services={services} />);

  const panel = screen.getByRole("complementary");
  await expect.element(panel.getByText(almendras.name, { exact: true })).toBeVisible();
  expect(panel.getByRole("table", { name: "Producciones" }).query()).toBeNull();
  expect(services.assemblyBatchesScreen.fetchAssemblyBatches).not.toHaveBeenCalled();
  expect(location()).toBe(address);
});

test("walks the prices of a purchase just registered in Precios, on Por revisar, taking them from the page so a reload does not walk them again", async () => {
  const services = productsServices(["prices_area", "catalog_area"]);
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
  const services = productsServices(["promotions", "catalog_area"]);
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

function productsWithPanel({ assembled }: { assembled: boolean }) {
  const services = productsServices([...EVERY_PRODUCT_CAPABILITY, "stock_balances"]);
  mockLoaded(services.productsListScreen, [honey, almonds]);
  services.productPanelSections = productPanelSections({
    assembledProductIds: assembled ? [honey.id] : [],
  });
  return services;
}

test("opens the panel of a simple product with Datos, Precio y costo and Stock y lotes, without Receta y producciones", async () => {
  const services = productsWithPanel({ assembled: false });
  window.history.pushState(null, "", `/products?product=${honey.id}`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  const panel = screen.getByRole("complementary", { name: honey.name });
  await expect.element(panel).toBeVisible();
  const tabs = panel.getByRole("tablist", { name: "Secciones del producto" });
  for (const [index, name] of ["Datos", "Precio y costo", "Stock y lotes"].entries()) {
    await expect.element(tabs.getByRole("tab").nth(index)).toHaveAccessibleName(name);
  }
  expect(tabs.getByRole("tab").elements()).toHaveLength(3);
  expect(tabs.getByRole("tab", { name: "Receta y producciones" }).query()).toBeNull();
});

test("adds Receta y producciones to the panel of an assembled product", async () => {
  const services = productsWithPanel({ assembled: true });
  window.history.pushState(null, "", `/products?product=${honey.id}`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Receta y producciones" })).toBeVisible();
});

test("a row opens the product's panel in the address and the tab of the panel is kept in it", async () => {
  const services = productsWithPanel({ assembled: false });
  window.history.pushState(null, "", "/products");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByText(almonds.name));

  await expect.element(screen.getByRole("complementary", { name: almonds.name })).toBeVisible();
  expect(location()).toBe(`/products?product=${almonds.id}`);

  await userEvent.click(screen.getByRole("tab", { name: "Stock y lotes" }));

  await expect.element(screen.getByText(`Stock y lotes de ${almonds.name}`)).toBeVisible();
  expect(location()).toBe(`/products?product=${almonds.id}&tab=stock`);
});

test("closing the panel takes the product and the tab out of the address", async () => {
  const services = productsWithPanel({ assembled: false });
  window.history.pushState(null, "", `/products?product=${honey.id}&tab=stock`);
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("complementary", { name: honey.name })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  await expect.poll(() => screen.getByRole("complementary").query()).toBeNull();
  expect(location()).toBe("/products");
});

test("keeps the panel open while the list's filters change", async () => {
  const services = productsWithPanel({ assembled: false });
  window.history.pushState(null, "", `/products?product=${honey.id}`);
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("complementary", { name: honey.name })).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar por nombre o código de barras"), "miel");

  await expect.poll(location).toBe(`/products?product=${honey.id}&search=miel`);
  await expect.element(screen.getByRole("complementary", { name: honey.name })).toBeVisible();
});

test("ignores a panel tab that is not a text in the address", async () => {
  const services = productsWithPanel({ assembled: false });
  window.history.pushState(null, "", `/products?product=${honey.id}&tab=7`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Datos", selected: true })).toBeVisible();
});
