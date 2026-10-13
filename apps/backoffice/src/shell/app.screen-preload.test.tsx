import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { App } from "./app";
import { emptyHelp } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens, screenCode } from "./test-support/screen-routes";

opensOnlyScreens(["/help"], { downloadedInTest: ["/", "/points-of-sale"] });

beforeEach(() => {
  window.history.pushState(null, "", "/help");
});

test("starts downloading a screen's code when the pointer rests on its menu link, before it is opened", async () => {
  const screen = await render(
    <App help={emptyHelp} services={createAppServices()} reportError={vi.fn()} />,
  );
  await expect.element(screen.getByRole("link", { name: "Inicio" })).toBeVisible();
  const homeScreenCode = vi.spyOn(screenCode("/"), "preload");

  await userEvent.hover(screen.getByRole("link", { name: "Inicio" }));

  await expect.poll(() => homeScreenCode).toHaveBeenCalled();
  expect(window.location.pathname).toBe("/help");
});

test("starts downloading a screen's code when its menu link receives focus, before it is opened", async () => {
  const screen = await render(
    <App help={emptyHelp} services={createAppServices()} reportError={vi.fn()} />,
  );
  await expect.element(screen.getByRole("link", { name: "Caja" })).toBeVisible();
  const pointsOfSaleScreenCode = vi.spyOn(screenCode("/points-of-sale"), "preload");

  (screen.getByRole("link", { name: "Caja" }).element() as HTMLElement).focus();

  await expect.poll(() => pointsOfSaleScreenCode).toHaveBeenCalled();
  expect(window.location.pathname).toBe("/help");
});
