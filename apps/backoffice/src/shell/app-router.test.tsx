import { defineHelp } from "@purosur/ui";
import { expect, onTestFinished, test, vi } from "vitest";
import { createAppRouter } from "./app-router";
import { createAppServices } from "./test-support/app-services";

function appRouter() {
  return createAppRouter({
    session: { kind: "signed-out", notice: undefined },
    help: defineHelp("es-AR", { categories: {}, articles: {} }),
    services: createAppServices(),
    sessionActions: { signedIn: vi.fn(), signedOut: vi.fn(), sessionEnded: vi.fn() },
    reportError: vi.fn(),
  });
}

test("keeps every screen's code out of the entry, to download only when it is needed", () => {
  const eagerScreens = Object.values(appRouter().routesById)
    .filter((route) => route.children === undefined && route.options.component !== undefined)
    .filter((route) => !("preload" in (route.options.component ?? {})))
    .map((route) => route.id);

  expect(eagerScreens).toEqual([]);
});

test("never preloads the code of a screen the person is refused", async () => {
  const router = createAppRouter({
    session: {
      kind: "signed-in",
      userId: "user-1",
      displayName: "Lucas Guardiola",
      isAdministrator: false,
      permissions: [],
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
