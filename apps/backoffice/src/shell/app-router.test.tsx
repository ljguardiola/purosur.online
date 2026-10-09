import { errorReportingOptions } from "@purosur/contracts";
import { defineHelp } from "@purosur/ui";
import { expect, onTestFinished, test, vi } from "vitest";
import { createAppRouter } from "./app-router";
import { createAppServices } from "./test-support/app-services";
import { appRouter, screenRoutes } from "./test-support/screen-routes";

test("keeps every screen's code out of the entry, to download only when it is needed", () => {
  const eagerScreens = screenRoutes()
    .filter((route) => !("preload" in (route.options.component ?? {})))
    .map((route) => route.id);

  expect(eagerScreens).toEqual([]);
});

test("keeps every screen address intact in error reports and navigation breadcrumbs", () => {
  const { beforeSend, beforeBreadcrumb } = errorReportingOptions();
  const addresses = Object.keys(appRouter().routesByPath);

  for (const address of addresses) {
    expect(beforeSend({ message: `failed on ${address}` }).message).toBe(`failed on ${address}`);
    expect(
      beforeBreadcrumb({ category: "navigation", data: { from: address, to: address } }).data,
    ).toStrictEqual({ from: address, to: address });
  }
  expect(addresses.length).toBeGreaterThan(1);
});

test("never preloads the code of a screen the person is refused", async () => {
  const router = createAppRouter({
    session: {
      kind: "signed-in",
      userId: "user-1",
      displayName: "Lucas Medrano",
      capabilities: [],
      stockMovementKinds: [],
      mayEmitOwnPinCode: false,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    help: defineHelp("es-AR", { categories: {}, articles: {} }),
    services: createAppServices(),
    sessionActions: { signedIn: vi.fn(), signedOut: vi.fn(), sessionEnded: vi.fn() },
    reportError: vi.fn(),
  });
  const pricesPage = router.routesById["/signed-in/catalog-area/prices"].options.component as {
    preload: () => Promise<void>;
  };
  const preload = vi.spyOn(pricesPage, "preload");
  onTestFinished(() => preload.mockRestore());

  await router.preloadRoute({ to: "/prices" });

  expect(preload).not.toHaveBeenCalled();
});
