import { defineHelp } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { createAppRouter } from "./app-router";
import { ScreenPending } from "./screen-pending";

function appRouter() {
  return createAppRouter({
    session: { kind: "signed-out", notice: undefined },
    help: defineHelp("es-AR", { categories: {}, articles: {} }),
    services: {} as never,
    sessionActions: { signedIn: vi.fn(), signedOut: vi.fn(), sessionEnded: vi.fn() },
  });
}

test("downloads every screen only when it is first opened", () => {
  const eagerScreens = Object.values(appRouter().routesById)
    .filter((route) => route.children === undefined && route.options.component !== undefined)
    .filter((route) => !("preload" in (route.options.component ?? {})))
    .map((route) => route.id);

  expect(eagerScreens).toEqual([]);
});

test("makes the loading notice the pending component of every route", () => {
  expect(appRouter().options.defaultPendingComponent).toBe(ScreenPending);
});
