import { afterEach, beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { linkProps } from "./linkProps";

beforeEach(() => {
  window.history.pushState(null, "", "/ayuda");
});

afterEach(() => {
  window.history.pushState(null, "", "/");
});

test("exposes the destination as href", () => {
  expect(linkProps("/ayuda/catalogo").href).toBe("/ayuda/catalogo");
});

test("its onClick navigates in place on a plain click", async () => {
  const props = linkProps("/ayuda/catalogo");
  const screen = await render(
    <a {...props} data-testid="link">
      Catálogo
    </a>,
  );

  await userEvent.click(screen.getByTestId("link"));

  expect(window.location.pathname).toBe("/ayuda/catalogo");
});

test("its onClick leaves a modifier click alone", async () => {
  const props = linkProps("/ayuda/catalogo");
  const screen = await render(
    <a {...props} data-testid="link">
      Catálogo
    </a>,
  );

  const cancelRealNavigation = (event: Event) => event.preventDefault();
  window.addEventListener("click", cancelRealNavigation);
  try {
    await userEvent.click(screen.getByTestId("link"), { modifiers: ["Meta"] });
  } finally {
    window.removeEventListener("click", cancelRealNavigation);
  }

  expect(window.location.pathname).toBe("/ayuda");
});
