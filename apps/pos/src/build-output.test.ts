import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const ELECTRON_VITE_CLI = join(
  dirname(createRequire(join(APP_DIR, "package.json")).resolve("electron-vite/package.json")),
  "bin/electron-vite.js",
);

const CHANNEL_VARIABLES = [
  "POS_CHANNEL",
  "POS_SENTRY_DSN",
  "POS_UPDATE_FEED_URL",
  "MAIN_VITE_SENTRY_DSN",
  "RENDERER_VITE_SENTRY_DSN",
  "VITE_SENTRY_DSN",
];

const outputDirs: string[] = [];

function environmentWith(overrides: Record<string, string>): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of CHANNEL_VARIABLES) {
    delete env[name];
  }
  return { ...env, ...overrides };
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function build(overrides: Record<string, string>): string {
  const outDir = mkdtempSync(join(tmpdir(), "purosur-pos-build-"));
  outputDirs.push(outDir);
  execFileSync(
    process.execPath,
    [ELECTRON_VITE_CLI, "build", "--outDir", outDir, "--logLevel", "error"],
    { cwd: APP_DIR, env: environmentWith(overrides), stdio: "pipe" },
  );
  return outDir;
}

function buildAndHash(overrides: Record<string, string>): Record<string, string> {
  const outDir = build(overrides);

  const hashes: Record<string, string> = {};
  for (const file of filesUnder(outDir)) {
    hashes[relative(outDir, file)] = createHash("sha256").update(readFileSync(file)).digest("hex");
  }
  return hashes;
}

afterAll(() => {
  for (const dir of outputDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("the register's compiled app code", () => {
  it("is byte-identical whatever channel or error-reporting target the build environment names", () => {
    const plain = buildAndHash({});
    const staging = buildAndHash({
      POS_CHANNEL: "staging",
      POS_SENTRY_DSN: "https://public@o1.ingest.sentry.io/2",
      POS_UPDATE_FEED_URL: "https://updates.example.com/staging",
      MAIN_VITE_SENTRY_DSN: "https://public@o1.ingest.sentry.io/2",
      RENDERER_VITE_SENTRY_DSN: "https://public@o1.ingest.sentry.io/2",
      VITE_SENTRY_DSN: "https://public@o1.ingest.sentry.io/2",
    });

    expect(Object.keys(plain).length).toBeGreaterThan(0);
    expect(staging).toEqual(plain);
  }, 120_000);
});

const UI_COMPONENTS_DIR = join(APP_DIR, "../../packages/ui/src/components");

function designSystemUtilityClasses(): string[] {
  const classes = new Set<string>();
  for (const file of filesUnder(UI_COMPONENTS_DIR)) {
    if (!file.endsWith(".tsx") || file.endsWith(".test.tsx")) {
      continue;
    }
    for (const match of readFileSync(file, "utf8").matchAll(/className="([^"]*)"/g)) {
      for (const name of match[1]?.split(/\s+/) ?? []) {
        if (/^[a-z][a-z0-9-]*-[a-z0-9-]+$/.test(name)) {
          classes.add(name);
        }
      }
    }
  }
  return [...classes];
}

describe("the register's compiled stylesheet", () => {
  it("includes every utility class the design system's components use", () => {
    const outDir = build({});
    const stylesheet = filesUnder(join(outDir, "renderer"))
      .filter((file) => file.endsWith(".css"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const classes = designSystemUtilityClasses();

    expect(classes.length).toBeGreaterThan(0);
    expect(classes.filter((name) => !stylesheet.includes(`.${name}`))).toEqual([]);
  }, 120_000);
});
