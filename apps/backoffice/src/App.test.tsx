import { defineHelp } from "@purosur/ui";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { App } from "./App";
import { fetchRegistrationOptions } from "./recoveryApi";

vi.mock("./recoveryApi", () => ({
  requestRecoveryLink: vi.fn(),
  fetchRegistrationOptions: vi.fn(() => new Promise(() => {})),
  redeemRecovery: vi.fn(),
}));

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

test("redirects the root path to /help without leaving the root in the history", async () => {
  const lengthBefore = window.history.length;

  await render(<App help={emptyHelp} />);

  await expect.poll(() => window.location.pathname).toBe("/help");
  expect(window.history.length).toBe(lengthBefore);
});

test("redirects a path outside Help to /help", async () => {
  window.history.pushState(null, "", "/ventas");

  await render(<App help={help} />);

  await expect.poll(() => window.location.pathname).toBe("/help");
});

test("redirects an unknown category or article to the closest page that exists", async () => {
  window.history.pushState(null, "", "/help/x/constructor");
  const screen = await render(<App help={help} />);

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

  const screen = await render(<App help={help} />);

  await expect.poll(() => window.location.pathname).toBe("/help/getting_started/intro");
  await expect.element(screen.getByText("Ayuda · Primeros pasos")).toBeVisible();
});

test("renders the shell's area rail and section column landmarks", async () => {
  const screen = await render(<App help={emptyHelp} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  await expect
    .element(screen.getByRole("navigation", { name: "Secciones de ayuda" }))
    .toBeVisible();
});

test("shows the active Help item in the rail and the Help screen's own content", async () => {
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} />);

  const helpItem = screen.getByRole("link", { name: "Ayuda" }).element() as HTMLAnchorElement;
  expect(helpItem.getAttribute("aria-current")).toBe("page");

  await expect.element(screen.getByRole("heading", { name: "Ayuda", level: 2 })).toBeVisible();
  await expect.element(screen.getByRole("searchbox", { name: "Buscar en la ayuda" })).toBeVisible();
  await expect.element(screen.getByText("Todavía no hay contenido de ayuda")).toBeVisible();
});

test("following a search result shows that article and clears the search", async () => {
  window.history.pushState(null, "", "/help");
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
  window.history.pushState(null, "", "/help/billing");
  const screen = await render(<App help={help} />);

  await userEvent.fill(screen.getByRole("searchbox", { name: "Buscar en la ayuda" }), "bienvenida");
  await expect.element(screen.getByRole("link", { name: "Bienvenida" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Facturación", exact: true }));

  await expect.element(screen.getByRole("link", { name: "Facturación básica" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Bienvenida" }).query()).toBeNull();
});

test("titles the document after the page being shown", async () => {
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={help} />);

  await expect.poll(() => document.title).toBe("Ayuda · Puro Sur");

  await userEvent.click(screen.getByRole("link", { name: "Primeros pasos" }));
  await expect.poll(() => document.title).toBe("Primeros pasos · Ayuda · Puro Sur");

  await userEvent.click(screen.getByRole("link", { name: "Bienvenida" }));
  await expect.poll(() => document.title).toBe("Bienvenida · Ayuda · Puro Sur");
});

test("moves focus to the page heading after an in-app navigation, not on the first load", async () => {
  window.history.pushState(null, "", "/help/getting_started/intro");
  const screen = await render(<App help={help} />);

  const firstHeading = screen.getByRole("heading", { name: "Bienvenida", level: 1 });
  await expect.element(firstHeading).toBeVisible();
  expect(document.activeElement).not.toBe(firstHeading.element());

  await userEvent.click(screen.getByRole("link", { name: "Facturación", exact: true }));

  await expect
    .element(screen.getByRole("heading", { name: "Facturación", level: 1 }))
    .toHaveFocus();
});

test("routes /sign-in to the sign-in screen, outside the Shell", async () => {
  window.history.pushState(null, "", "/sign-in");

  const screen = await render(<App help={emptyHelp} />);

  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Áreas" }).query()).toBeNull();
});

test("routes /account-recovery to the recovery form, outside the Shell", async () => {
  window.history.pushState(null, "", "/account-recovery");

  const screen = await render(<App help={emptyHelp} />);

  await expect
    .element(screen.getByRole("heading", { name: "Recuperar el acceso", level: 1 }))
    .toBeVisible();
  expect(screen.getByRole("navigation", { name: "Áreas" }).query()).toBeNull();
});

test("routes /account-recovery/passkey to the passkey registration screen, reading its token from the hash", async () => {
  window.history.pushState(null, "", "/account-recovery/passkey#the-token");

  const screen = await render(<App help={emptyHelp} />);

  await expect.element(screen.getByText("Abriendo el registro…")).toBeVisible();
  expect(fetchRegistrationOptions).toHaveBeenCalledWith("the-token");
  expect(screen.getByRole("navigation", { name: "Áreas" }).query()).toBeNull();
});

test("shows a focus ring on the page heading it focuses after a keyboard navigation", async () => {
  window.history.pushState(null, "", "/help/getting_started");
  const screen = await render(<App help={help} />);

  const link = screen
    .getByRole("link", { name: "Facturación", exact: true })
    .element() as HTMLElement;
  link.focus();
  await userEvent.keyboard("{Enter}");

  const heading = screen.getByRole("heading", { name: "Facturación", level: 1 });
  await expect.element(heading).toHaveFocus();
  await expect.element(heading).toBeVisible();
  const headingElement = heading.element() as HTMLElement;
  // toBeVisible() accepts a visually hidden (sr-only) element, whose clipped box is 1px wide.
  expect(headingElement.getBoundingClientRect().width).toBeGreaterThan(1);
  const style = getComputedStyle(headingElement);
  await expect.poll(() => style.outlineStyle).toBe("solid");
  expect(style.outlineWidth).toBe("3px");
  expect(style.outlineColor).toBe(style.color);
});
