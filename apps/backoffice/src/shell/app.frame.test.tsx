import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { App } from "./app";
import { emptyHelp, help, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/account-recovery",
  "/products/classification",
  "/fiscal/settings",
  "/help",
  "/products",
  "/sign-in",
  "/people/users",
  "/purchases",
  "/registers",
  "/reports/sales-by-day",
  "/stock",
]);

beforeEach(resetPageState);

test("opens Inicio at /, with Inicio active in the rail", async () => {
  window.history.pushState(null, "", "/");

  const screen = await render(<App help={emptyHelp} services={createAppServices()} />);

  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
  const rail = screen.getByRole("navigation", { name: "Áreas" });
  await expect
    .element(rail.getByRole("link", { name: "Inicio" }))
    .toHaveAttribute("aria-current", "page");
});

test.each(["/ventas", "/helps", "/help/getting_started/intro/extra", "/catalog", "/settings"])(
  "redirects %s, which names no screen, to /help",
  async (path) => {
    window.history.pushState(null, "", path);

    await render(<App help={help} services={createAppServices()} />);

    await expect.poll(() => window.location.pathname).toBe("/help");
  },
);

test("a rail item is a real link to its screen, and a plain click opens that screen in place", async () => {
  const services = createAppServices();
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={services} />);
  const configItem = screen.getByRole("link", { name: "Configuración" });
  await expect.element(configItem).toBeVisible();

  expect(configItem.element().getAttribute("href")).toBe("/people");
  await userEvent.click(configItem);

  await expect.element(screen.getByRole("heading", { name: "Personas", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/people/users");

  window.history.back();

  await expect.poll(() => window.location.pathname).toBe("/help");
});

test("a rail item leaves a modifier click to the browser", async () => {
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={createAppServices()} />);
  const configItem = screen.getByRole("link", { name: "Configuración" });
  await expect.element(configItem).toBeVisible();

  const cancelRealNavigation = (event: Event) => event.preventDefault();
  window.addEventListener("click", cancelRealNavigation);
  try {
    await userEvent.click(configItem, { modifiers: ["Meta"] });
  } finally {
    window.removeEventListener("click", cancelRealNavigation);
  }

  expect(window.location.pathname).toBe("/help");
  expect(screen.getByRole("heading", { name: "Personas" }).query()).toBeNull();
});

test("renders the shell's area rail and section column landmarks", async () => {
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={createAppServices()} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  await expect
    .element(screen.getByRole("navigation", { name: "Secciones de ayuda" }))
    .toBeVisible();
});

test("provides the backoffice field size at the root, so a screen never has to ask for it", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  window.history.pushState(null, "", "/account-recovery");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Recuperar el acceso", level: 1 }))
    .toBeVisible();

  const label = screen.getByText("Correo de tu cuenta").element() as HTMLElement;
  const input = screen.getByRole("textbox", { name: /^Correo de tu cuenta/ }).element();
  const box = input.parentElement as HTMLElement;

  expect(Math.round(Number.parseFloat(getComputedStyle(label).fontSize))).toBe(14);
  expect(box.getBoundingClientRect().height).toBeCloseTo(48, 0);
});

test.each(["/help", "/users", "/products/classification", "/products"])(
  "lists Inicio above Productos in the rail on %s",
  async (path) => {
    window.history.pushState(null, "", path);
    const services = createAppServices();
    vi.mocked(services.categoriesListScreen.fetchCategories).mockResolvedValue({
      kind: "ok",
      value: [],
    });
    vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({
      kind: "ok",
      value: [],
    });
    vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
      kind: "ok",
      value: [],
    });

    const screen = await render(<App help={emptyHelp} services={services} />);

    const rail = screen.getByRole("navigation", { name: "Áreas" });
    await expect.element(rail.getByRole("link", { name: "Inicio" })).toBeVisible();
    const labels = rail
      .getByRole("link")
      .elements()
      .map((link) => link.textContent);
    expect(labels.indexOf("Inicio")).toBeLessThan(labels.indexOf("Productos"));
  },
);

test("lists exactly the rail areas of a person with every capability, in order, with Ayuda and the account in the footer", async () => {
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={createAppServices()} />);

  const rail = screen.getByRole("navigation", { name: "Áreas" });
  await expect.element(rail.getByRole("link", { name: "Inicio" })).toBeVisible();
  const labels = rail
    .getByRole("link")
    .elements()
    .map((link) => link.textContent);
  expect(labels.slice(0, 8)).toEqual([
    "Inicio",
    "Ventas y caja",
    "Productos",
    "Compras",
    "Stock",
    "Fiscal",
    "Reportes",
    "Configuración",
  ]);
  expect(labels[8]).toBe("Ayuda");
});

test.each([
  ["/registers", "Ventas y caja"],
  ["/purchases", "Compras"],
  ["/stock", "Stock"],
  ["/reports/sales-by-day", "Reportes"],
  ["/people/users", "Configuración"],
])("opens %s with its column titled like the %s rail area", async (path, area) => {
  window.history.pushState(null, "", path);
  const services = createAppServices();
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  const screen = await render(<App help={emptyHelp} services={services} />);

  const column = screen.getByRole("navigation", { name: area, exact: true });
  await expect.element(column.getByRole("heading", { name: area, level: 2 })).toBeVisible();
  await expect
    .element(
      screen
        .getByRole("navigation", { name: "Áreas" })
        .getByRole("link", { name: area, exact: true }),
    )
    .toHaveTextContent(area);
});

test.each(["/help", "/users", "/products/classification", "/products"])(
  "lists Productos above Configuración in the rail on %s",
  async (path) => {
    window.history.pushState(null, "", path);
    const services = createAppServices();
    vi.mocked(services.categoriesListScreen.fetchCategories).mockResolvedValue({
      kind: "ok",
      value: [],
    });
    vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({
      kind: "ok",
      value: [],
    });
    vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
      kind: "ok",
      value: [],
    });

    const screen = await render(<App help={emptyHelp} services={services} />);

    const rail = screen.getByRole("navigation", { name: "Áreas" });
    await expect.element(rail.getByRole("link", { name: "Productos" })).toBeVisible();
    const labels = rail
      .getByRole("link")
      .elements()
      .map((link) => link.textContent);
    expect(labels.indexOf("Productos")).toBeLessThan(labels.indexOf("Configuración"));
  },
);

test.each(["/help", "/users", "/products", "/fiscal/settings"])(
  "lists Productos, then Fiscal, then Configuración in the rail on %s",
  async (path) => {
    window.history.pushState(null, "", path);
    const services = createAppServices();
    vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({
      kind: "ok",
      value: [],
    });
    vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
      kind: "ok",
      value: [],
    });
    vi.mocked(services.fiscalSettingsScreen.fetchIssuerIdentification).mockResolvedValue({
      kind: "ok",
      value: {
        legalName: FICTIONAL_LEGAL_NAME,
        grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
        activityStartDate: "2019-03-01",
        authorizedCuit: FICTIONAL_CUIT,
        taxStatus: "Responsable Monotributo",
        version: 1,
      },
    });

    const screen = await render(<App help={emptyHelp} services={services} />);

    const rail = screen.getByRole("navigation", { name: "Áreas" });
    await expect.element(rail.getByRole("link", { name: "Fiscal", exact: true })).toBeVisible();
    const labels = rail
      .getByRole("link")
      .elements()
      .map((link) => link.textContent);
    expect(labels.indexOf("Productos")).toBeLessThan(labels.indexOf("Fiscal"));
    expect(labels.indexOf("Fiscal")).toBeLessThan(labels.indexOf("Configuración"));
  },
);
