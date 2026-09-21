import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { navigate, onNavigate, useRoute } from "./router";

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

test("a replacing navigate() swaps the current history entry instead of adding one", async () => {
  const screen = await render(<RouteProbe />);
  navigate("/ayuda/catalogo");
  const lengthBefore = window.history.length;

  navigate("/ayuda/ventas", { replace: true });

  await expect.element(screen.getByTestId("route")).toHaveTextContent("/ayuda/ventas");
  expect(window.history.length).toBe(lengthBefore);

  window.history.back();

  await expect.element(screen.getByTestId("route")).toHaveTextContent(INITIAL_PATH);
});

test("onNavigate hears every navigate() call, including one to the current pathname", () => {
  const listener = vi.fn();
  const unsubscribe = onNavigate(listener);

  navigate("/ayuda/catalogo");
  navigate("/ayuda/catalogo");
  unsubscribe();
  navigate("/ayuda/ventas");

  expect(listener).toHaveBeenCalledTimes(2);
});

test("onNavigate hears the browser's back button", async () => {
  navigate("/ayuda/catalogo");
  const listener = vi.fn();
  const unsubscribe = onNavigate(listener);

  window.history.back();

  await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
  unsubscribe();
});
