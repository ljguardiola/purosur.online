import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { App } from "./app";
import { emptyHelp, help, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";

beforeEach(resetPageState);

afterEach(resetPageState);

test("redirects an unknown category or article to the closest page that exists", async () => {
  window.history.pushState(null, "", "/help/x/constructor");
  const screen = await render(<App help={help} services={createAppServices()} />);

  await expect.poll(() => window.location.pathname).toBe("/help");
  await expect
    .element(screen.getByRole("heading", { name: "Elegí una sección", level: 1 }))
    .toBeInTheDocument();

  window.history.pushState(null, "", "/help/getting_started/unknown");
  window.dispatchEvent(new PopStateEvent("popstate"));

  await expect.poll(() => window.location.pathname).toBe("/help/getting_started");
});

test("moves an article reached under another category to its own category's URL", async () => {
  window.history.pushState(null, "", "/help/billing/intro");

  const screen = await render(<App help={help} services={createAppServices()} />);

  await expect.poll(() => window.location.pathname).toBe("/help/getting_started/intro");
  await expect.element(screen.getByText("Ayuda · Primeros pasos")).toBeVisible();
});

test("shows the active Help item in the rail, leaving other areas in the rail unhighlighted, and the Help screen's own content", async () => {
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={createAppServices()} />);

  const helpItemLocator = screen.getByRole("link", { name: "Ayuda" });
  await expect.element(helpItemLocator).toBeVisible();
  const helpItem = helpItemLocator.element() as HTMLAnchorElement;
  expect(helpItem.getAttribute("aria-current")).toBe("page");

  const configItemLocator = screen.getByRole("link", { name: "Config" });
  await expect.element(configItemLocator).toBeVisible();
  const configItem = configItemLocator.element() as HTMLAnchorElement;
  expect(configItem.getAttribute("aria-current")).toBeNull();

  await expect.element(screen.getByRole("heading", { name: "Ayuda", level: 2 })).toBeVisible();
  await expect.element(screen.getByRole("searchbox", { name: "Buscar en la ayuda" })).toBeVisible();
  await expect.element(screen.getByText("Todavía no hay contenido de ayuda")).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});

test("following a search result shows that article and clears the search", async () => {
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={help} services={createAppServices()} />);

  await userEvent.fill(screen.getByRole("searchbox", { name: "Buscar en la ayuda" }), "factura");
  await userEvent.click(screen.getByRole("link", { name: "Facturación básica" }));

  await expect
    .element(screen.getByRole("heading", { name: "Facturación básica", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Cómo emitir una factura.")).toBeVisible();
  await expect
    .element(screen.getByRole("searchbox", { name: "Buscar en la ayuda" }))
    .toHaveValue("");
});

test("following a section link to the current page while searching shows that section", async () => {
  window.history.pushState(null, "", "/help/billing");
  const screen = await render(<App help={help} services={createAppServices()} />);

  await userEvent.fill(screen.getByRole("searchbox", { name: "Buscar en la ayuda" }), "bienvenida");
  await expect.element(screen.getByRole("link", { name: "Bienvenida" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Facturación", exact: true }));

  await expect.element(screen.getByRole("link", { name: "Facturación básica" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Bienvenida" }).query()).toBeNull();
});
