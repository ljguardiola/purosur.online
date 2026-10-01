import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { App } from "./app";
import { emptyHelp } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";

let requested: string[] = [];
let requests: PerformanceObserver;

function downloaded(module: string): boolean {
  return requested.some((name) => name.includes(module));
}

beforeEach(() => {
  requested = [];
  requests = new PerformanceObserver((list) => {
    requested.push(...list.getEntries().map((entry) => entry.name));
  });
  requests.observe({ type: "resource" });
  window.history.pushState(null, "", "/help");
});

afterEach(() => {
  requests.disconnect();
  window.history.pushState(null, "", "/");
});

test("downloads a screen's code when the pointer rests on its menu link, before it is opened", async () => {
  const screen = await render(
    <App help={emptyHelp} services={createAppServices()} reportError={vi.fn()} />,
  );
  await expect.element(screen.getByRole("link", { name: "Inicio" })).toBeVisible();

  await userEvent.hover(screen.getByRole("link", { name: "Inicio" }));

  await expect.poll(() => downloaded("alerts-overview-page")).toBe(true);
  expect(window.location.pathname).toBe("/help");
});

test("downloads a screen's code when its menu link receives focus, before it is opened", async () => {
  const screen = await render(
    <App help={emptyHelp} services={createAppServices()} reportError={vi.fn()} />,
  );
  await expect.element(screen.getByRole("link", { name: "Caja" })).toBeVisible();

  (screen.getByRole("link", { name: "Caja" }).element() as HTMLElement).focus();

  await expect.poll(() => downloaded("points-of-sale-page")).toBe(true);
  expect(window.location.pathname).toBe("/help");
});
