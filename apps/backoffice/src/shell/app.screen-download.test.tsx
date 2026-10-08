import type {} from "@vitest/browser-playwright";
import { StrictMode } from "react";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { App } from "./app";
import { ScreenDownloadFailure } from "./lazy-screen";
import { emptyHelp } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { loadEveryScreenCodeExcept } from "./test-support/screen-routes";

async function blockDownloadsMatching(...patterns: string[]) {
  const session = cdp();
  await session.send("Network.enable");
  await session.send("Network.setBlockedURLs", { urls: patterns });
}

beforeAll(() => loadEveryScreenCodeExcept("/", "/alerts"));

beforeEach(async () => {
  window.history.pushState(null, "", "/");
  window.sessionStorage.clear();
  await blockDownloadsMatching("*alerts-list-page*", "*alerts-overview-page*");
});

afterEach(async () => {
  await cdp().send("Network.setBlockedURLs", { urls: [] });
  window.history.pushState(null, "", "/");
  window.sessionStorage.clear();
});

test("shows a Spanish failure inside the area, without reporting it, when a screen's code cannot download while offline", async () => {
  window.history.pushState(null, "", "/help");
  const services = createAppServices();
  vi.mocked(services.screenFailure.isOnline).mockReturnValue(false);
  const reportError = vi.fn();
  const screen = await render(
    <App help={emptyHelp} services={services} reportError={reportError} />,
  );
  await expect.element(screen.getByRole("link", { name: "Inicio" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Inicio" }));

  await expect
    .element(screen.getByRole("heading", { name: "No pudimos mostrar esta pantalla", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 2 })).toBeVisible();
  expect(screen.getByText("Something went wrong!").query()).toBeNull();
  expect(services.screenFailure.reloadPage).not.toHaveBeenCalled();
  expect(reportError).not.toHaveBeenCalled();
});

test("asks to check the connection, instead of reloading, when trying again while still offline, and reloads once back online", async () => {
  window.history.pushState(null, "", "/alerts");
  const services = createAppServices();
  vi.mocked(services.screenFailure.isOnline).mockReturnValue(false);
  const screen = await render(<App help={emptyHelp} services={services} reportError={vi.fn()} />);
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Revisá la conexión a internet y probá de nuevo.");
  expect(services.screenFailure.reloadPage).not.toHaveBeenCalled();

  vi.mocked(services.screenFailure.isOnline).mockReturnValue(true);
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(services.screenFailure.reloadPage).toHaveBeenCalledTimes(1);
});

test("reloads the page once, instead of showing or reporting a failure, when a screen's code cannot download while online", async () => {
  window.history.pushState(null, "", "/alerts");
  const services = createAppServices();
  vi.mocked(services.screenFailure.isOnline).mockReturnValue(true);
  const reportError = vi.fn();

  const screen = await render(
    <App help={emptyHelp} services={services} reportError={reportError} />,
  );

  await expect.poll(() => vi.mocked(services.screenFailure.reloadPage).mock.calls.length).toBe(1);
  expect(screen.getByText("No pudimos mostrar esta pantalla").query()).toBeNull();
  expect(reportError).not.toHaveBeenCalled();
});

test("reloads the page once, without flashing the failure, when effects run twice", async () => {
  window.history.pushState(null, "", "/alerts");
  const services = createAppServices();
  vi.mocked(services.screenFailure.isOnline).mockReturnValue(true);

  const screen = await render(
    <StrictMode>
      <App help={emptyHelp} services={services} reportError={vi.fn()} />
    </StrictMode>,
  );

  await expect.poll(() => vi.mocked(services.screenFailure.reloadPage).mock.calls.length).toBe(1);
  expect(screen.getByText("No pudimos mostrar esta pantalla").query()).toBeNull();
  expect(services.screenFailure.reloadPage).toHaveBeenCalledTimes(1);
});

test("shows the failure, instead of reloading again, when the screen's code still cannot download after that reload", async () => {
  window.history.pushState(null, "", "/alerts");
  const services = createAppServices();
  vi.mocked(services.screenFailure.isOnline).mockReturnValue(true);
  const first = await render(<App help={emptyHelp} services={services} reportError={vi.fn()} />);
  await expect.poll(() => vi.mocked(services.screenFailure.reloadPage).mock.calls.length).toBe(1);
  await first.unmount();

  const reportError = vi.fn();

  const screen = await render(
    <App help={emptyHelp} services={services} reportError={reportError} />,
  );

  await expect
    .element(screen.getByRole("heading", { name: "No pudimos mostrar esta pantalla", level: 1 }))
    .toBeVisible();
  expect(services.screenFailure.reloadPage).toHaveBeenCalledTimes(1);
  expect(reportError).toHaveBeenCalledTimes(1);
  expect(reportError).toHaveBeenCalledWith(expect.any(ScreenDownloadFailure));
});

test("shows the failure, instead of reloading again, when the screen's code still cannot download after trying again once back online", async () => {
  window.history.pushState(null, "", "/alerts");
  const services = createAppServices();
  vi.mocked(services.screenFailure.isOnline).mockReturnValue(false);
  const first = await render(<App help={emptyHelp} services={services} reportError={vi.fn()} />);
  await expect.element(first.getByRole("button", { name: "Reintentar" })).toBeVisible();
  vi.mocked(services.screenFailure.isOnline).mockReturnValue(true);
  await userEvent.click(first.getByRole("button", { name: "Reintentar" }));
  await first.unmount();

  const screen = await render(<App help={emptyHelp} services={services} reportError={vi.fn()} />);

  await expect
    .element(screen.getByRole("heading", { name: "No pudimos mostrar esta pantalla", level: 1 }))
    .toBeVisible();
  expect(services.screenFailure.reloadPage).toHaveBeenCalledTimes(1);
});
