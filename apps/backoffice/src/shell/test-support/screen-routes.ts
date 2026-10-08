import { defineHelp } from "@purosur/ui";
import { afterAll, afterEach, beforeAll, expect, type MockInstance, vi } from "vitest";
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

type ScreenComponent = NonNullable<ReturnType<typeof screenRoutes>[number]["options"]["component"]>;

function screenCodeByPaths(): Map<ScreenComponent, string[]> {
  const code = new Map<ScreenComponent, string[]>();
  const screens = new Set(screenRoutes());
  for (const [path, route] of Object.entries(appRouter().routesByPath)) {
    const component = route.options.component;
    if (screens.has(route) && component?.preload) {
      code.set(component, [...(code.get(component) ?? []), path]);
    }
  }
  return code;
}

// A screen's code downloading on a loaded machine can outlast a test's whole wait on its own, so
// every screen a test file opens is downloaded before its tests, and opening any other one fails.
export function opensOnlyScreens(
  opened: ScreenPath[],
  { downloadedInTest = [] }: { downloadedInTest?: ScreenPath[] } = {},
) {
  const listed = (paths: string[], list: string[]) => paths.some((path) => list.includes(path));
  const unlisted: { paths: string[]; preload: MockInstance }[] = [];

  beforeAll(async () => {
    const preloads: (Promise<void> | undefined)[] = [];
    for (const [code, paths] of screenCodeByPaths()) {
      if (listed(paths, opened)) {
        preloads.push(code.preload?.());
      } else if (!listed(paths, downloadedInTest)) {
        unlisted.push({ paths, preload: vi.spyOn(code, "preload") });
      }
    }
    await Promise.all(preloads);
  });

  afterEach(() => {
    const downloaded = unlisted.filter(({ preload }) => preload.mock.calls.length > 0);
    for (const { preload } of unlisted) {
      preload.mockClear();
    }
    expect(
      downloaded.map(({ paths }) => paths.join(" ")),
      "screens this test file opens without listing them",
    ).toEqual([]);
  });

  afterAll(() => {
    for (const { preload } of unlisted) {
      preload.mockRestore();
    }
  });
}
