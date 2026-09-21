import { afterEach, beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { navigate, useRoute } from "./router";

const INITIAL_PATH = "/ayuda";

beforeEach(() => {
  window.history.pushState(null, "", INITIAL_PATH);
});

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function RouteProbe() {
  const route = useRoute();
  return <p data-testid="route">{route}</p>;
}

test("reads the current pathname on mount", async () => {
  const screen = await render(<RouteProbe />);

  await expect.element(screen.getByTestId("route")).toHaveTextContent(INITIAL_PATH);
});

test("re-renders with the new pathname after navigate() pushes a history entry", async () => {
  const screen = await render(<RouteProbe />);

  navigate("/ayuda/catalogo");

  await expect.element(screen.getByTestId("route")).toHaveTextContent("/ayuda/catalogo");
  expect(window.location.pathname).toBe("/ayuda/catalogo");
});

test("re-renders with the pathname the browser's back button restores", async () => {
  const screen = await render(<RouteProbe />);

  navigate("/ayuda/catalogo");
  await expect.element(screen.getByTestId("route")).toHaveTextContent("/ayuda/catalogo");

  window.history.back();

  await expect.element(screen.getByTestId("route")).toHaveTextContent(INITIAL_PATH);
});

test("navigating to the current pathname again does not grow the history stack", async () => {
  const screen = await render(<RouteProbe />);
  const lengthBefore = window.history.length;

  navigate(INITIAL_PATH);

  await expect.element(screen.getByTestId("route")).toHaveTextContent(INITIAL_PATH);
  expect(window.history.length).toBe(lengthBefore);
});
