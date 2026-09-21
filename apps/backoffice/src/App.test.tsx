import { afterEach, beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { App } from "./App";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

afterEach(() => {
  window.history.pushState(null, "", "/");
});

test("redirects the root path to /ayuda", async () => {
  await render(<App />);

  await expect.poll(() => window.location.pathname).toBe("/ayuda");
});

test("renders the shell's area rail landmark", async () => {
  const screen = await render(<App />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
});

test("leaves an already-specific path alone", async () => {
  window.history.pushState(null, "", "/ayuda");

  await render(<App />);

  expect(window.location.pathname).toBe("/ayuda");
});

test("shows the active Ayuda item in the rail and the Ayuda screen's own content", async () => {
  window.history.pushState(null, "", "/ayuda");

  const screen = await render(<App />);

  const ayudaItem = screen.getByRole("link", { name: "Ayuda" }).element() as HTMLAnchorElement;
  expect(ayudaItem.getAttribute("aria-current")).toBe("page");

  await expect.element(screen.getByRole("heading", { name: "Ayuda", level: 2 })).toBeVisible();
  await expect.element(screen.getByRole("searchbox", { name: "Buscar en la ayuda" })).toBeVisible();
  await expect.element(screen.getByText("Todavía no hay contenido de ayuda")).toBeVisible();
});
