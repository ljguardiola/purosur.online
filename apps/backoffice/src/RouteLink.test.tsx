import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { RouteLink } from "./RouteLink";

beforeEach(() => {
  window.history.pushState(null, "", "/ayuda");
});

afterEach(() => {
  window.history.pushState(null, "", "/");
});

test("renders as a real anchor pointing at its destination", async () => {
  const screen = await render(<RouteLink to="/ayuda/catalogo">Catálogo</RouteLink>);

  const link = screen.getByRole("link", { name: "Catálogo" }).element() as HTMLAnchorElement;
  expect(link.getAttribute("href")).toBe("/ayuda/catalogo");
});

test("navigates in place on a plain click instead of reloading the page", async () => {
  const screen = await render(<RouteLink to="/ayuda/catalogo">Catálogo</RouteLink>);
  const link = screen.getByRole("link", { name: "Catálogo" });

  await userEvent.click(link);

  expect(window.location.pathname).toBe("/ayuda/catalogo");
});

test("still calls a caller-supplied onClick handler", async () => {
  const onClick = vi.fn();
  const screen = await render(
    <RouteLink to="/ayuda/catalogo" onClick={onClick}>
      Catálogo
    </RouteLink>,
  );

  await userEvent.click(screen.getByRole("link", { name: "Catálogo" }));

  expect(onClick).toHaveBeenCalledTimes(1);
});

test("lets a modifier-key click open a new tab instead of intercepting it", async () => {
  const screen = await render(<RouteLink to="/ayuda/catalogo">Catálogo</RouteLink>);
  const link = screen.getByRole("link", { name: "Catálogo" });

  // A real modifier click here would make the browser follow the href for real, navigating this
  // test's own iframe away from the harness. window is the outermost bubble target, so this
  // listener always runs after RouteLink's own onClick already decided whether to call
  // preventDefault: it only cancels the browser's leftover default action afterward, without
  // affecting that decision, which is what the assertion below observes.
  const cancelRealNavigation = (event: Event) => event.preventDefault();
  window.addEventListener("click", cancelRealNavigation);
  try {
    await userEvent.click(link, { modifiers: ["Meta"] });
  } finally {
    window.removeEventListener("click", cancelRealNavigation);
  }

  // The SPA's own route never changed: RouteLink left the click's default action alone instead
  // of calling navigate() on it.
  expect(window.location.pathname).toBe("/ayuda");
});
