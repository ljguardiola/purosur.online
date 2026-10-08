import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { App } from "./app";
import { emptyHelp } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import {
  requested,
  startRecordingRequests,
  stopRecordingRequests,
} from "./test-support/requested-urls";

beforeEach(async () => {
  await startRecordingRequests();
  window.history.pushState(null, "", "/help");
});

afterEach(async () => {
  await stopRecordingRequests();
  window.history.pushState(null, "", "/");
});

test("starts downloading a screen's code when the pointer rests on its menu link, before it is opened", async () => {
  const screen = await render(
    <App help={emptyHelp} services={createAppServices()} reportError={vi.fn()} />,
  );
  await expect.element(screen.getByRole("link", { name: "Inicio" })).toBeVisible();

  await userEvent.hover(screen.getByRole("link", { name: "Inicio" }));

  await expect.poll(() => requested("home-page")).toBe(true);
  expect(window.location.pathname).toBe("/help");
});

test("starts downloading a screen's code when its menu link receives focus, before it is opened", async () => {
  const screen = await render(
    <App help={emptyHelp} services={createAppServices()} reportError={vi.fn()} />,
  );
  await expect.element(screen.getByRole("link", { name: "Caja" })).toBeVisible();

  (screen.getByRole("link", { name: "Caja" }).element() as HTMLElement).focus();

  await expect.poll(() => requested("points-of-sale-page")).toBe(true);
  expect(window.location.pathname).toBe("/help");
});
