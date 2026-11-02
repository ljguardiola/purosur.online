import { fileURLToPath } from "node:url";
import { build, type Rolldown } from "vite";
import { afterEach, expect, test } from "vitest";

const BACKOFFICE_ROOT = fileURLToPath(new URL(".", import.meta.url));
const DEPLOYED_RELEASE = "0f3a9c1d7b2e4a5f8c6d1e0b9a7f3c2d4e5b6a71";

async function bundleBuiltWith(appVersion: string | undefined): Promise<string> {
  const previous = process.env["APP_VERSION"];
  if (appVersion === undefined) {
    delete process.env["APP_VERSION"];
  } else {
    process.env["APP_VERSION"] = appVersion;
  }
  try {
    const output = (await build({
      root: BACKOFFICE_ROOT,
      configFile: `${BACKOFFICE_ROOT}vite.config.ts`,
      logLevel: "silent",
      build: { write: false },
    })) as Rolldown.RolldownOutput;
    return output.output.flatMap((file) => (file.type === "chunk" ? file.code : "")).join("\n");
  } finally {
    if (previous === undefined) {
      delete process.env["APP_VERSION"];
    } else {
      process.env["APP_VERSION"] = previous;
    }
  }
}

afterEach(() => {
  delete process.env["APP_VERSION"];
});

test("a build made for a release carries that release in the bundle", async () => {
  const code = await bundleBuiltWith(DEPLOYED_RELEASE);

  expect(code.includes(DEPLOYED_RELEASE)).toBe(true);
  expect(code.includes("__BACKOFFICE_RELEASE__")).toBe(false);
}, 0);

test("a build made without a release leaves no unresolved release for the tab to read", async () => {
  const code = await bundleBuiltWith(undefined);

  expect(code.includes(DEPLOYED_RELEASE)).toBe(false);
  expect(code.includes("__BACKOFFICE_RELEASE__")).toBe(false);
}, 0);
