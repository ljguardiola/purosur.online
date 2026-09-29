import { fileURLToPath } from "node:url";
import { build, type Rolldown } from "vite";
import { expect, test } from "vitest";

const BACKOFFICE_ROOT = fileURLToPath(new URL(".", import.meta.url));
const UI_COMPONENTS = fileURLToPath(new URL("../../packages/ui/src/components/", import.meta.url));

async function modulesTheEntryDownloads() {
  const output = (await build({
    root: BACKOFFICE_ROOT,
    configFile: `${BACKOFFICE_ROOT}vite.config.ts`,
    logLevel: "silent",
    build: { write: false },
  })) as Rolldown.RolldownOutput;
  const chunks = new Map(
    output.output
      .filter((file): file is Rolldown.OutputChunk => file.type === "chunk")
      .map((chunk) => [chunk.fileName, chunk]),
  );
  const downloaded = new Set<string>();
  const pending = [...chunks.values()].filter((chunk) => chunk.isEntry);
  for (let chunk = pending.pop(); chunk; chunk = pending.pop()) {
    if (downloaded.has(chunk.fileName)) continue;
    downloaded.add(chunk.fileName);
    pending.push(...chunk.imports.flatMap((fileName) => chunks.get(fileName) ?? []));
  }
  return [...downloaded].flatMap((fileName) => chunks.get(fileName)?.moduleIds ?? []);
}

test("the entry downloads the design system components the shell renders, not those only screens render", async () => {
  const modules = await modulesTheEntryDownloads();

  expect(modules).toContain(`${UI_COMPONENTS}forms/field-size.tsx`);
  expect(modules).not.toContain(`${UI_COMPONENTS}forms/date-field.tsx`);
}, 60_000);
