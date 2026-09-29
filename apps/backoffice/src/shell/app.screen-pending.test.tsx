import { defineHelp } from "@purosur/ui";
import type {} from "@vitest/browser-playwright";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { App } from "./app";
import { createAppServices } from "./test-support/app-services";

const emptyHelp = defineHelp("es-AR", { categories: {}, articles: {} });

let heldRequests: string[] = [];

cdp().on("Fetch.requestPaused", ({ requestId }) => {
  heldRequests.push(requestId);
});

async function holdDownloadsMatching(...urlPatterns: string[]) {
  await cdp().send("Fetch.enable", { patterns: urlPatterns.map((urlPattern) => ({ urlPattern })) });
}

async function releaseHeldDownloads() {
  const session = cdp();
  try {
    for (const requestId of heldRequests) {
      await session.send("Fetch.continueRequest", { requestId });
    }
  } finally {
    heldRequests = [];
    await session.send("Fetch.disable");
  }
}

function topBarHeight(main: Element): number {
  return main.firstElementChild?.getBoundingClientRect().height ?? 0;
}

beforeEach(async () => {
  window.history.pushState(null, "", "/help");
  await holdDownloadsMatching("*alerts-list-page*", "*alerts-overview-page*");
});

afterEach(async () => {
  await releaseHeldDownloads();
  window.history.pushState(null, "", "/");
});

test("shows the loading placeholder inside the area, below a top bar the screen keeps once it arrives, while a screen's code downloads", async () => {
  const screen = await render(
    <App help={emptyHelp} services={createAppServices()} reportError={vi.fn()} />,
  );
  await expect.element(screen.getByRole("link", { name: "Inicio" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Inicio" }));

  const main = screen.getByRole("main");
  await expect.element(main.getByRole("status")).toHaveTextContent("Cargando…");
  await expect.element(screen.getByRole("navigation", { name: "Inicio" })).toBeVisible();
  const pendingTopBarHeight = topBarHeight(main.element());

  await releaseHeldDownloads();

  await expect.element(main.getByRole("heading", { level: 1 })).toBeVisible();
  expect(topBarHeight(main.element())).toBe(pendingTopBarHeight);
});
