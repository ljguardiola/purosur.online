import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../access/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/account",
  "/brands",
  "/categories",
  "/discounts",
  "/help",
  "/prices",
  "/products",
  "/tags",
]);

beforeEach(resetPageState);

afterEach(resetPageState);

test("shows the Catálogo item in the rail for a user holding manage_products_and_categories, linking to the products list", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        capabilities: ["products_and_categories", "catalog_area"],
      }),
    ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("link", { name: "Catálogo" })).toBeVisible();
});

test("hides the Catálogo item in the rail for a user without the permission", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Catálogo" }).query()).toBeNull();
});

test("following the rail's Catálogo item opens the products list, with Catálogo and Productos active", async () => {
  window.history.pushState(null, "", "/help");
  const services = createAppServices();
  vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("link", { name: "Catálogo" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Catálogo" }));

  await expect.element(screen.getByRole("heading", { name: "Productos", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/products");
  const catalogItem = screen.getByRole("link", { name: "Catálogo" }).element() as HTMLAnchorElement;
  expect(catalogItem.getAttribute("aria-current")).toBe("page");
  const productsItem = screen
    .getByRole("link", { name: "Productos" })
    .element() as HTMLAnchorElement;
  expect(productsItem.getAttribute("aria-current")).toBe("page");
});

test("navigating directly to /categories opens the categories list, with Categorías active", async () => {
  window.history.pushState(null, "", "/categories");
  const services = createAppServices();
  vi.mocked(services.categoriesListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Categorías", level: 1 })).toBeVisible();
  const categoriesItem = screen
    .getByRole("link", { name: "Categorías" })
    .element() as HTMLAnchorElement;
  expect(categoriesItem.getAttribute("aria-current")).toBe("page");
  window.history.pushState(null, "", "/");
});

test("redirects a non-permitted user's typed /categories to Mi cuenta, without listing categories", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/categories");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/account");
  expect(services.categoriesListScreen.fetchCategories).not.toHaveBeenCalled();
});

test("navigating directly to /brands opens the brands list, with Marcas active", async () => {
  window.history.pushState(null, "", "/brands");
  const services = createAppServices();
  vi.mocked(services.brandsListScreen.fetchBrands).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Marcas", level: 1 })).toBeVisible();
  const brandsItem = screen.getByRole("link", { name: "Marcas" }).element() as HTMLAnchorElement;
  expect(brandsItem.getAttribute("aria-current")).toBe("page");
  window.history.pushState(null, "", "/");
});

test("redirects a non-permitted user's typed /brands to Mi cuenta, without listing brands", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/brands");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/account");
  expect(services.brandsListScreen.fetchBrands).not.toHaveBeenCalled();
});

test("navigating directly to /tags opens the tags list, with Distintivos active between Marcas and Precios", async () => {
  window.history.pushState(null, "", "/tags");
  const services = createAppServices();
  vi.mocked(services.tagsListScreen.fetchTags).mockResolvedValue({
    kind: "ok",
    value: { tags: [], taggedProductCount: 0 },
  });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Distintivos", level: 1 }))
    .toBeVisible();
  const tagsItem = screen.getByRole("link", { name: "Distintivos" }).element() as HTMLAnchorElement;
  expect(tagsItem.getAttribute("aria-current")).toBe("page");
  const labels = screen
    .getByRole("link")
    .all()
    .map((link) => link.element().textContent);
  expect(
    labels.filter((label) => ["Marcas", "Distintivos", "Precios"].includes(label ?? "")),
  ).toEqual(["Marcas", "Distintivos", "Precios"]);
  window.history.pushState(null, "", "/");
});

test("redirects a non-permitted user's typed /tags to Mi cuenta, without listing tags", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/tags");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/account");
  expect(services.tagsListScreen.fetchTags).not.toHaveBeenCalled();
});

test("redirects a non-permitted user's typed /products to Mi cuenta, without listing products", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/products");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/account");
  expect(services.productsListScreen.fetchProducts).not.toHaveBeenCalled();
});

test("redirects a non-permitted user's typed /prices to Mi cuenta, without listing prices", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/prices");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/account");
  expect(services.pricesListScreen.fetchPrices).not.toHaveBeenCalled();
});

test("redirects a user holding only manage_products_and_categories away from a typed /prices", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        capabilities: ["products_and_categories", "catalog_area"],
      }),
    ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/prices");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.pricesListScreen.fetchPrices).not.toHaveBeenCalled();
});

test("redirects a user holding only manage_prices_and_review away from a typed /products", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        capabilities: ["prices_area", "catalog_area"],
      }),
    ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/products");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.productsListScreen.fetchProducts).not.toHaveBeenCalled();
});

test("shows the Precios section, and only it, for a user holding only manage_prices_and_review, opening it by default from the rail's Catálogo item", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        capabilities: ["prices_area", "catalog_area"],
      }),
    ),
  });
  vi.mocked(services.pricesListScreen.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products: [],
      pendingCount: 0,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Catálogo" }));

  await expect.element(screen.getByRole("heading", { name: "Precios", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/prices");
  expect(screen.getByRole("link", { name: "Productos" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Categorías" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Marcas" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Distintivos" }).query()).toBeNull();
  await expect.element(screen.getByRole("link", { name: "Precios" })).toBeVisible();
});

test("hides the Precios section item for a user holding only manage_products_and_categories", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        capabilities: ["products_and_categories", "catalog_area"],
      }),
    ),
  });
  window.history.pushState(null, "", "/products");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Productos", level: 1 })).toBeVisible();
  expect(screen.getByRole("link", { name: "Precios" }).query()).toBeNull();
});

test("navigating directly to /discounts opens the promotions list, with Promociones active after Precios", async () => {
  window.history.pushState(null, "", "/discounts");
  const services = createAppServices();
  vi.mocked(services.discountsListScreen.fetchDiscounts).mockResolvedValue({
    kind: "ok",
    value: { discounts: [] },
  });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Promociones", level: 1 }))
    .toBeVisible();
  const promotionsItem = screen
    .getByRole("link", { name: "Promociones" })
    .element() as HTMLAnchorElement;
  expect(promotionsItem.getAttribute("aria-current")).toBe("page");
  const labels = screen
    .getByRole("link")
    .all()
    .map((link) => link.element().textContent);
  expect(
    labels.filter((label) => ["Distintivos", "Precios", "Promociones"].includes(label ?? "")),
  ).toEqual(["Distintivos", "Precios", "Promociones"]);
});

test("redirects a non-permitted user's typed /discounts to Mi cuenta, without listing promotions", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/discounts");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.discountsListScreen.fetchDiscounts).not.toHaveBeenCalled();
});

test.each([["products_and_categories"], ["prices_area"]] as const)(
  "redirects a user holding only %s away from a typed /discounts",
  async (capability) => {
    const services = createAppServices({
      fetchSession: vi.fn().mockResolvedValue(
        openSession({
          userId: "user-2",
          displayName: "Grace Hopper",
          isAdministrator: false,
          capabilities: [capability, "catalog_area"],
        }),
      ),
    });
    vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
    window.history.pushState(null, "", "/discounts");

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect
      .element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 }))
      .toBeVisible();
    expect(services.discountsListScreen.fetchDiscounts).not.toHaveBeenCalled();
  },
);

test.each([
  ["products_and_categories", "/products", "Productos"],
  ["prices_area", "/prices", "Precios"],
] as const)(
  "hides the Promociones section item for a user holding only %s",
  async (capability, path, heading) => {
    const services = createAppServices({
      fetchSession: vi.fn().mockResolvedValue(
        openSession({
          userId: "user-2",
          displayName: "Grace Hopper",
          isAdministrator: false,
          capabilities: [capability, "catalog_area"],
        }),
      ),
    });
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    expect(screen.getByRole("link", { name: "Promociones" }).query()).toBeNull();
  },
);

test("shows the Promociones section, and only it, for a user holding only manage_promotions, opening it by default from the rail's Catálogo item", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        capabilities: ["promotions", "catalog_area"],
      }),
    ),
  });
  vi.mocked(services.discountsListScreen.fetchDiscounts).mockResolvedValue({
    kind: "ok",
    value: { discounts: [] },
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Catálogo" }));

  await expect
    .element(screen.getByRole("heading", { name: "Promociones", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/discounts");
  expect(screen.getByRole("link", { name: "Productos" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Categorías" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Marcas" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Distintivos" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Precios" }).query()).toBeNull();
  await expect.element(screen.getByRole("link", { name: "Promociones" })).toBeVisible();
});

test.each([["/products"], ["/prices"]])(
  "redirects a user holding only manage_promotions away from a typed %s",
  async (path) => {
    const services = createAppServices({
      fetchSession: vi.fn().mockResolvedValue(
        openSession({
          userId: "user-2",
          displayName: "Grace Hopper",
          isAdministrator: false,
          capabilities: ["promotions", "catalog_area"],
        }),
      ),
    });
    vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect
      .element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 }))
      .toBeVisible();
    expect(services.productsListScreen.fetchProducts).not.toHaveBeenCalled();
    expect(services.pricesListScreen.fetchPrices).not.toHaveBeenCalled();
  },
);

test("lists the promotions and opens Nueva promoción for a user holding only manage_promotions", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        capabilities: ["promotions", "catalog_area"],
      }),
    ),
  });
  vi.mocked(services.discountsListScreen.fetchDiscounts).mockResolvedValue({
    kind: "ok",
    value: {
      discounts: [
        {
          id: "0b1f3c1e-4f6a-4d0e-9d6e-000000000001",
          name: "Yerba de septiembre",
          benefit: { kind: "PERCENT_OFF", percent: 15 },
          target: { kind: "PRODUCT", id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000101", name: "Yerba" },
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
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/discounts");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-20T15:00:00.000Z"));
  try {
    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByText("Yerba de septiembre")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Nueva promoción" }));
    await expect.element(screen.getByRole("dialog", { name: "Nueva promoción" })).toBeVisible();
    expect(window.location.pathname).toBe("/discounts");
  } finally {
    vi.useRealTimers();
  }
});
