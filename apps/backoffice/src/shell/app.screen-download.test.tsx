import { defineHelp } from "@purosur/ui";
import type {} from "@vitest/browser-playwright";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { App } from "./app";
import { createAppServices } from "./test-support/app-services";

const emptyHelp = defineHelp("es-AR", { categories: {}, articles: {} });

async function blockDownloadsMatching(pattern: string) {
  const session = cdp();
  await session.send("Network.enable");
  await session.send("Network.setBlockedURLs", { urls: [pattern] });
}

beforeEach(async () => {
  window.history.pushState(null, "", "/");
  window.sessionStorage.clear();
  await blockDownloadsMatching("*alerts-list-page*");
});

afterEach(async () => {
  await cdp().send("Network.setBlockedURLs", { urls: [] });
  window.history.pushState(null, "", "/");
  window.sessionStorage.clear();
});

test("shows a Spanish failure inside the area, and reloads the page to try again, when a screen's code cannot download while offline", async () => {
  window.history.pushState(null, "", "/help");
  const services = createAppServices();
  vi.mocked(services.screenFailure.isOnline).mockReturnValue(false);
  const screen = await render(<App help={emptyHelp} services={services} reportError={vi.fn()} />);
  await expect.element(screen.getByRole("link", { name: "Inicio" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Inicio" }));

  await expect
    .element(screen.getByRole("heading", { name: "No pudimos mostrar esta pantalla", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 2 })).toBeVisible();
  expect(screen.getByText("Something went wrong!").query()).toBeNull();
  expect(services.screenFailure.reloadPage).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(services.screenFailure.reloadPage).toHaveBeenCalledTimes(1);
});

test("reloads the page once, instead of showing a failure, when a screen's code cannot download while online", async () => {
  window.history.pushState(null, "", "/home/alerts");
  const services = createAppServices();
  vi.mocked(services.screenFailure.isOnline).mockReturnValue(true);

  const screen = await render(<App help={emptyHelp} services={services} reportError={vi.fn()} />);

  await expect.poll(() => vi.mocked(services.screenFailure.reloadPage).mock.calls.length).toBe(1);
  expect(screen.getByText("No pudimos mostrar esta pantalla").query()).toBeNull();
});

test("shows the failure, instead of reloading again, when the screen's code still cannot download after that reload", async () => {
  window.history.pushState(null, "", "/home/alerts");
  const services = createAppServices();
  vi.mocked(services.screenFailure.isOnline).mockReturnValue(true);
  const first = await render(<App help={emptyHelp} services={services} reportError={vi.fn()} />);
  await expect.poll(() => vi.mocked(services.screenFailure.reloadPage).mock.calls.length).toBe(1);
  await first.unmount();

  const screen = await render(<App help={emptyHelp} services={services} reportError={vi.fn()} />);

  await expect
    .element(screen.getByRole("heading", { name: "No pudimos mostrar esta pantalla", level: 1 }))
    .toBeVisible();
  expect(services.screenFailure.reloadPage).toHaveBeenCalledTimes(1);
});
