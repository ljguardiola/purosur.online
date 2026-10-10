import { fileURLToPath } from "node:url";
import { build, type Rolldown } from "vite";
import { beforeAll, expect, test } from "vitest";

const BACKOFFICE_ROOT = fileURLToPath(new URL(".", import.meta.url));
const UI_COMPONENTS = fileURLToPath(new URL("../../packages/ui/src/components/", import.meta.url));
const SIGN_IN_PAGE = `${BACKOFFICE_ROOT}src/sessions/sign-in-page.tsx`;
const BRANDS_LIST_PAGE = `${BACKOFFICE_ROOT}src/catalog/brands-list-page.tsx`;

let chunks: Map<string, Rolldown.OutputChunk>;

// The build ends on its own, succeeding or failing, so the setup waits for it however long the
// machine takes to build.
beforeAll(async () => {
  const output = (await build({
    root: BACKOFFICE_ROOT,
    configFile: `${BACKOFFICE_ROOT}vite.config.ts`,
    logLevel: "silent",
    build: { write: false },
  })) as Rolldown.RolldownOutput;
  chunks = new Map(
    output.output
      .filter((file): file is Rolldown.OutputChunk => file.type === "chunk")
      .map((chunk) => [chunk.fileName, chunk]),
  );
}, 0);

function modulesDownloadedFrom(starts: Rolldown.OutputChunk[]) {
  const downloaded = new Set<string>();
  const pending = [...starts];
  for (let chunk = pending.pop(); chunk; chunk = pending.pop()) {
    if (downloaded.has(chunk.fileName)) continue;
    downloaded.add(chunk.fileName);
    pending.push(...chunk.imports.flatMap((fileName) => chunks.get(fileName) ?? []));
  }
  return [...downloaded].flatMap((fileName) => chunks.get(fileName)?.moduleIds ?? []);
}

const entryChunks = () => [...chunks.values()].filter((chunk) => chunk.isEntry);

test("the entry downloads the design system components the shell renders, not those only screens render", () => {
  const modules = modulesDownloadedFrom(entryChunks());

  expect(modules).toContain(`${UI_COMPONENTS}forms/field-size.tsx`);
  expect(modules).not.toContain(`${UI_COMPONENTS}forms/date-field.tsx`);
});

test("opening a screen downloads the design system components it renders, not those only other screens render", () => {
  const signInPage = [...chunks.values()].filter((chunk) => chunk.facadeModuleId === SIGN_IN_PAGE);
  const modules = modulesDownloadedFrom([...entryChunks(), ...signInPage]);

  expect(modules).toContain(SIGN_IN_PAGE);
  expect(modules).toContain(`${UI_COMPONENTS}forms/button.tsx`);
  expect(modules).not.toContain(`${UI_COMPONENTS}forms/date-field.tsx`);
});

const screenWiring = (moduleId: string) =>
  moduleId.startsWith(`${BACKOFFICE_ROOT}src/`) && /-(?:api|services)\.ts$/.test(moduleId);

test("the entry downloads only the API clients the frame itself needs, and no screen's services", () => {
  const modules = modulesDownloadedFrom(entryChunks()).filter(screenWiring);

  expect(modules.sort()).toEqual([
    `${BACKOFFICE_ROOT}src/platform/error-reporting-configuration-api.ts`,
    `${BACKOFFICE_ROOT}src/sessions/session-api.ts`,
  ]);
});

test("opening a screen downloads its services and its API client with it", () => {
  const brandsListPage = [...chunks.values()].filter(
    (chunk) => chunk.facadeModuleId === BRANDS_LIST_PAGE,
  );
  const entryModules = new Set(modulesDownloadedFrom(entryChunks()));
  const modules = modulesDownloadedFrom(brandsListPage).filter(
    (moduleId) => !entryModules.has(moduleId),
  );

  expect(modules).toContain(`${BACKOFFICE_ROOT}src/catalog/brands-list-services.ts`);
  expect(modules).toContain(`${BACKOFFICE_ROOT}src/catalog/brands-api.ts`);
});

test("the build carries the design system's screen-reader texts only in Spanish", () => {
  const translations = [...chunks.values()]
    .flatMap((chunk) => chunk.moduleIds)
    .flatMap(
      (moduleId) =>
        moduleId.match(/[\\/]intl[\\/](?:.+[\\/])?([a-z]{2}-[A-Z]{2})\.m?js$/)?.[1] ?? [],
    );

  expect(new Set(translations)).toEqual(new Set(["es-ES"]));
});
