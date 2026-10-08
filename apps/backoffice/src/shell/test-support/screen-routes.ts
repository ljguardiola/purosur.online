import { defineHelp } from "@purosur/ui";
import { vi } from "vitest";
import { createAppRouter } from "../app-router";
import { createAppServices } from "./app-services";

export function appRouter() {
  return createAppRouter({
    session: { kind: "signed-out", notice: undefined },
    help: defineHelp("es-AR", { categories: {}, articles: {} }),
    services: createAppServices(),
    sessionActions: { signedIn: vi.fn(), signedOut: vi.fn(), sessionEnded: vi.fn() },
    reportError: vi.fn(),
  });
}

export function screenRoutes() {
  return Object.values(appRouter().routesById).filter(
    (route) => route.children === undefined && route.options.component !== undefined,
  );
}

type ScreenPath = keyof ReturnType<typeof appRouter>["routesByPath"];

// A screen's code downloading on a loaded machine can outlast a test's whole wait on its own.
export async function loadEveryScreenCodeExcept(...skippedPaths: ScreenPath[]) {
  const skipped = new Set<string>(skippedPaths);
  await Promise.all(
    screenRoutes()
      .filter((route) => !skipped.has(route.fullPath))
      .map((route) => route.options.component?.preload?.()),
  );
}

export function loadEveryScreenCode() {
  return loadEveryScreenCodeExcept();
}
