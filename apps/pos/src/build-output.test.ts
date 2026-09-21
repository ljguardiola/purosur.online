import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
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

let plainOutDir: string | undefined;

function plainBuild(): string {
  plainOutDir ??= build({});
  return plainOutDir;
}

function hashes(outDir: string): Record<string, string> {
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
    const plain = hashes(plainBuild());
    const staging = hashes(
      build({
        POS_CHANNEL: "staging",
        POS_SENTRY_DSN: "https://public@o1.ingest.sentry.io/2",
        POS_UPDATE_FEED_URL: "https://updates.example.com/staging",
        MAIN_VITE_SENTRY_DSN: "https://public@o1.ingest.sentry.io/2",
        RENDERER_VITE_SENTRY_DSN: "https://public@o1.ingest.sentry.io/2",
        VITE_SENTRY_DSN: "https://public@o1.ingest.sentry.io/2",
      }),
    );

    expect(Object.keys(plain).length).toBeGreaterThan(0);
    expect(staging).toEqual(plain);
  }, 120_000);
});

const UI_COMPONENTS_DIR = join(APP_DIR, "../../packages/ui/src/components");
const UI_TOKENS_CSS = join(APP_DIR, "../../packages/ui/src/styles/tokens.css");

// The same scanner and compiler @tailwindcss/vite itself builds the app's CSS with (see its own
// source): the design system's own theme decides what a candidate compiles to, so this finds and
// validates classes exactly as the real build does — a plain literal className, a *ClassName
// constant, a variant-map value, a function body, a template literal, an arbitrary-value or
// arbitrary-variant selector, anything Tailwind's own scanner recognizes, wherever it appears in
// the file — with no hand-rolled shape rules to keep in sync with new patterns. candidatesToCss
// returns null for a scanned token that isn't actually a valid utility (an import specifier, a TS
// union member, a *ClassName record's own variant key, plain prose), so those are never even
// candidates to filter out by hand.
async function designSystemUtilityClasses(): Promise<string[]> {
  const designSystem = await __unstable__loadDesignSystem(readFileSync(UI_TOKENS_CSS, "utf8"), {
    base: dirname(UI_TOKENS_CSS),
  });
  const scanner = new Scanner({
    sources: [
      { base: UI_COMPONENTS_DIR, pattern: "**/*", negated: false },
      { base: UI_COMPONENTS_DIR, pattern: "**/*.test.tsx", negated: true },
    ],
  });
  const candidates = scanner.scan();
  const compiled = designSystem.candidatesToCss(candidates);
  return candidates.filter((_, index) => compiled[index] !== null);
}

// Tailwind writes a class name into its selector with every character outside [A-Za-z0-9_-]
// backslash-escaped (`hover:x` becomes `.hover\:x`, `w-2/5` becomes `.w-2\/5`).
function selectorFor(name: string): RegExp {
  const escaped = name.replace(/[^A-Za-z0-9_-]/g, (character) => `\\${character}`);
  const pattern = escaped.replace(/[\\^$.*+?()[\]{}|/]/g, (character) => `\\${character}`);
  return new RegExp(`\\.${pattern}(?![A-Za-z0-9_\\\\-])`);
}

describe("the register's compiled stylesheet", () => {
  it("includes every utility class the design system's components use", async () => {
    const stylesheet = filesUnder(join(plainBuild(), "renderer"))
      .filter((file) => file.endsWith(".css"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const classes = await designSystemUtilityClasses();

    expect(classes.length).toBeGreaterThan(0);
    expect(classes.filter((name) => !selectorFor(name).test(stylesheet))).toEqual([]);
  }, 120_000);

  it("matches a class only by its whole selector", () => {
    expect(selectorFor("gap-1").test(".gap-10{gap:1rem}")).toBe(false);
    expect(selectorFor("gap-1").test(".gap-1{gap:1rem}")).toBe(true);
    expect(selectorFor("w-2/5").test(".w-2\\/5{width:40%}")).toBe(true);
    expect(selectorFor("h-[164px]").test(".h-\\[164px\\]{height:164px}")).toBe(true);
    expect(selectorFor("hover:bg-x").test(".hover\\:bg-x:hover{color:red}")).toBe(true);
    expect(selectorFor("hover:bg-x").test(".hover\\:bg-x-strong:hover{color:red}")).toBe(false);
  });
});

describe("designSystemUtilityClasses", () => {
  it("finds classes wherever packages/ui's components build them, not just literal JSX className attributes", async () => {
    const classes = await designSystemUtilityClasses();

    // A plain literal `className="..."` attribute (Table.tsx's empty state title), unique to it.
    expect(classes).toContain("max-w-[32.5rem]");
    // A class returned from a function body, built with a ternary (Table.tsx's
    // cellHorizontalPaddingClassName), unique to it.
    expect(classes).toContain("pl-1.5");
    // A lowercase `const className = [...]` — not a `*ClassName`-named identifier
    // (NotificationCard.tsx), unique to it.
    expect(classes).toContain("border-l-4");
    // A template literal, not a plain string (TextField.tsx's requiredLabelClassName), unique to
    // it.
    expect(classes).toContain("after:content-['*']");
    // A ternary's true-branch operand immediately followed by ":" (ListFilter.tsx) — a
    // hand-rolled "string followed by : is a variant-map key" rule would drop this, unique to it.
    expect(classes).toContain("border-brand-blue-ui");
    // Modal.tsx's ModalContextTone union members and TextField.tsx's frameClassName variant keys
    // are never classes, however class-shaped they read.
    expect(classes).not.toContain("brand-blue-ui");
    expect(classes).not.toContain("plain-text");
  });
});
