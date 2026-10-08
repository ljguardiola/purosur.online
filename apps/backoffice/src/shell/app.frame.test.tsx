import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { App } from "./app";
import { emptyHelp, help, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { loadEveryScreenCode } from "./test-support/screen-routes";

beforeAll(loadEveryScreenCode);

beforeEach(resetPageState);

afterEach(resetPageState);

test("opens Inicio at /, with Inicio and Resumen active", async () => {
  window.history.pushState(null, "", "/");

  const screen = await render(<App help={emptyHelp} services={createAppServices()} />);

  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
  const rail = screen.getByRole("navigation", { name: "Áreas" });
  await expect
    .element(rail.getByRole("link", { name: "Inicio" }))
    .toHaveAttribute("aria-current", "page");
  await expect
    .element(screen.getByRole("link", { name: "Resumen" }))
    .toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Alertas" }).element().hasAttribute("aria-current")).toBe(
    false,
  );
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
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={services} />);
  const configItem = screen.getByRole("link", { name: "Config" });
  await expect.element(configItem).toBeVisible();

  expect(configItem.element().getAttribute("href")).toBe("/account");
  await userEvent.click(configItem);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/account");

  window.history.back();

  await expect.poll(() => window.location.pathname).toBe("/help");
});

test("a rail item leaves a modifier click to the browser", async () => {
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={createAppServices()} />);
  const configItem = screen.getByRole("link", { name: "Config" });
  await expect.element(configItem).toBeVisible();

  const cancelRealNavigation = (event: Event) => event.preventDefault();
  window.addEventListener("click", cancelRealNavigation);
  try {
    await userEvent.click(configItem, { modifiers: ["Meta"] });
  } finally {
    window.removeEventListener("click", cancelRealNavigation);
  }

  expect(window.location.pathname).toBe("/help");
  expect(screen.getByRole("heading", { name: "Mi cuenta" }).query()).toBeNull();
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

test.each(["/help", "/users", "/categories", "/products"])(
  "lists Inicio above Catálogo in the rail on %s",
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
    expect(labels.indexOf("Inicio")).toBeLessThan(labels.indexOf("Catálogo"));
  },
);

test.each(["/help", "/users", "/categories", "/products"])(
  "lists Catálogo above Config in the rail on %s",
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
    await expect.element(rail.getByRole("link", { name: "Catálogo" })).toBeVisible();
    const labels = rail
      .getByRole("link")
      .elements()
      .map((link) => link.textContent);
    expect(labels.indexOf("Catálogo")).toBeLessThan(labels.indexOf("Config"));
  },
);

test.each(["/help", "/users", "/products", "/fiscal-settings"])(
  "lists Catálogo, then Caja, then Config in the rail on %s",
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
    vi.mocked(services.fiscalConfigurationScreen.fetchIssuerIdentification).mockResolvedValue({
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
    await expect.element(rail.getByRole("link", { name: "Caja" })).toBeVisible();
    const labels = rail
      .getByRole("link")
      .elements()
      .map((link) => link.textContent);
    expect(labels.indexOf("Catálogo")).toBeLessThan(labels.indexOf("Caja"));
    expect(labels.indexOf("Caja")).toBeLessThan(labels.indexOf("Config"));
  },
);
