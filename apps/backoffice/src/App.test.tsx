import { defineHelp } from "@purosur/ui";
import { afterEach, beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { App } from "./App";

const emptyHelp = defineHelp("es-AR", { categories: {}, articles: {} });

const help = defineHelp("es-AR", {
  categories: {
    getting_started: { label: "Primeros pasos" },
    billing: { label: "Facturación" },
  },
  articles: {
    intro: {
      category: "getting_started",
      title: "Bienvenida",
      body: [{ kind: "paragraph", text: "Configurá tu catálogo antes de abrir la caja." }],
    },
    billing_basics: {
      category: "billing",
      title: "Facturación básica",
      body: [{ kind: "paragraph", text: "Cómo emitir una factura." }],
    },
  },
});

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

afterEach(() => {
  window.history.pushState(null, "", "/");
});

test("redirects the root path to /ayuda without leaving the root in the history", async () => {
  const lengthBefore = window.history.length;

  await render(<App help={emptyHelp} />);

  await expect.poll(() => window.location.pathname).toBe("/ayuda");
  expect(window.history.length).toBe(lengthBefore);
});

test("redirects a path outside Ayuda to /ayuda", async () => {
  window.history.pushState(null, "", "/ventas");

  await render(<App help={help} />);

  await expect.poll(() => window.location.pathname).toBe("/ayuda");
});

test("redirects an unknown category or article to the closest page that exists", async () => {
  window.history.pushState(null, "", "/ayuda/x/constructor");
  const screen = await render(<App help={help} />);

  await expect.poll(() => window.location.pathname).toBe("/ayuda");
  await expect
    .element(screen.getByRole("heading", { name: "Ayuda", level: 1 }))
    .toBeInTheDocument();

  window.history.pushState(null, "", "/ayuda/getting_started/unknown");
  window.dispatchEvent(new PopStateEvent("popstate"));

  await expect.poll(() => window.location.pathname).toBe("/ayuda/getting_started");
});

test("moves an article reached under another category to its own category's URL", async () => {
  window.history.pushState(null, "", "/ayuda/billing/intro");

  const screen = await render(<App help={help} />);

  await expect.poll(() => window.location.pathname).toBe("/ayuda/getting_started/intro");
  await expect.element(screen.getByText("Ayuda · Primeros pasos")).toBeVisible();
});

test("renders the shell's area rail and section column landmarks", async () => {
  const screen = await render(<App help={emptyHelp} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  await expect
    .element(screen.getByRole("navigation", { name: "Secciones de ayuda" }))
    .toBeVisible();
});

test("shows the active Ayuda item in the rail and the Ayuda screen's own content", async () => {
  window.history.pushState(null, "", "/ayuda");

  const screen = await render(<App help={emptyHelp} />);

  const ayudaItem = screen.getByRole("link", { name: "Ayuda" }).element() as HTMLAnchorElement;
  expect(ayudaItem.getAttribute("aria-current")).toBe("page");

  await expect.element(screen.getByRole("heading", { name: "Ayuda", level: 2 })).toBeVisible();
  await expect.element(screen.getByRole("searchbox", { name: "Buscar en la ayuda" })).toBeVisible();
  await expect.element(screen.getByText("Todavía no hay contenido de ayuda")).toBeVisible();
});

test("following a search result shows that article and clears the search", async () => {
  window.history.pushState(null, "", "/ayuda");
  const screen = await render(<App help={help} />);

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
  window.history.pushState(null, "", "/ayuda/billing");
  const screen = await render(<App help={help} />);

  await userEvent.fill(screen.getByRole("searchbox", { name: "Buscar en la ayuda" }), "bienvenida");
  await expect.element(screen.getByRole("link", { name: "Bienvenida" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Facturación", exact: true }));

  await expect.element(screen.getByRole("link", { name: "Facturación básica" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Bienvenida" }).query()).toBeNull();
});

test("titles the document after the page being shown", async () => {
  window.history.pushState(null, "", "/ayuda");
  const screen = await render(<App help={help} />);

  await expect.poll(() => document.title).toBe("Ayuda · Puro Sur");

  await userEvent.click(screen.getByRole("link", { name: "Primeros pasos" }));
  await expect.poll(() => document.title).toBe("Primeros pasos · Ayuda · Puro Sur");

  await userEvent.click(screen.getByRole("link", { name: "Bienvenida" }));
  await expect.poll(() => document.title).toBe("Bienvenida · Ayuda · Puro Sur");
});

test("moves focus to the page heading after an in-app navigation, not on the first load", async () => {
  window.history.pushState(null, "", "/ayuda/getting_started/intro");
  const screen = await render(<App help={help} />);

  const firstHeading = screen.getByRole("heading", { name: "Bienvenida", level: 1 });
  await expect.element(firstHeading).toBeVisible();
  expect(document.activeElement).not.toBe(firstHeading.element());

  await userEvent.click(screen.getByRole("link", { name: "Facturación", exact: true }));

  await expect
    .element(screen.getByRole("heading", { name: "Facturación", level: 1 }))
    .toHaveFocus();
});
