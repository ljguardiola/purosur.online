import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../access/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";

beforeEach(resetPageState);

afterEach(resetPageState);

test("shows the Catálogo item in the rail for a user holding manage_products_and_categories, linking to the products list", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["manage_products_and_categories"],
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
  expect(window.location.pathname).toBe("/catalog/products");
  const catalogItem = screen.getByRole("link", { name: "Catálogo" }).element() as HTMLAnchorElement;
  expect(catalogItem.getAttribute("aria-current")).toBe("page");
  const productsItem = screen
    .getByRole("link", { name: "Productos" })
    .element() as HTMLAnchorElement;
  expect(productsItem.getAttribute("aria-current")).toBe("page");
});

test("navigating directly to /catalog/categories opens the categories list, with Categorías active", async () => {
  window.history.pushState(null, "", "/catalog/categories");
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

test("redirects a non-permitted user's typed /catalog/categories to Mi cuenta, without listing categories", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/catalog/categories");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.categoriesListScreen.fetchCategories).not.toHaveBeenCalled();
});

test("navigating directly to /catalog/brands opens the brands list, with Marcas active", async () => {
  window.history.pushState(null, "", "/catalog/brands");
  const services = createAppServices();
  vi.mocked(services.brandsListScreen.fetchBrands).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Marcas", level: 1 })).toBeVisible();
  const brandsItem = screen.getByRole("link", { name: "Marcas" }).element() as HTMLAnchorElement;
  expect(brandsItem.getAttribute("aria-current")).toBe("page");
  window.history.pushState(null, "", "/");
});

test("redirects a non-permitted user's typed /catalog/brands to Mi cuenta, without listing brands", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/catalog/brands");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.brandsListScreen.fetchBrands).not.toHaveBeenCalled();
});

test("redirects a non-permitted user's typed /catalog/products to Mi cuenta, without listing products", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/catalog/products");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.productsListScreen.fetchProducts).not.toHaveBeenCalled();
});

test("redirects a non-permitted user's typed /catalog/prices to Mi cuenta, without listing prices", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/catalog/prices");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/settings/users/me");
  expect(services.pricesListScreen.fetchPrices).not.toHaveBeenCalled();
});

test("redirects a user holding only manage_products_and_categories away from a typed /catalog/prices", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["manage_products_and_categories"],
      }),
    ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/catalog/prices");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.pricesListScreen.fetchPrices).not.toHaveBeenCalled();
});

test("redirects a user holding only manage_prices_and_review away from a typed /catalog/products", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["manage_prices_and_review"],
      }),
    ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/catalog/products");

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
        permissions: ["manage_prices_and_review"],
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
  expect(window.location.pathname).toBe("/catalog/prices");
  expect(screen.getByRole("link", { name: "Productos" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Categorías" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Marcas" }).query()).toBeNull();
  await expect.element(screen.getByRole("link", { name: "Precios" })).toBeVisible();
});

test("hides the Precios section item for a user holding only manage_products_and_categories", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["manage_products_and_categories"],
      }),
    ),
  });
  window.history.pushState(null, "", "/catalog/products");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Productos", level: 1 })).toBeVisible();
  expect(screen.getByRole("link", { name: "Precios" }).query()).toBeNull();
});
