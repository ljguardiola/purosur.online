import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
// Only used to resolve `@import "tailwindcss"` from a minimal, self-contained theme in tests that
// don't want packages/ui's own design tokens (its own package.json already depends on
// tailwindcss, so it resolves from here without adding a dependency apps/pos doesn't otherwise
// need).
const TAILWIND_RESOLUTION_BASE = dirname(UI_TOKENS_CSS);

interface ScannedUtility {
  candidate: string;
  // The exact selector Tailwind's own compiler emitted for this candidate (e.g.
  // ".hover\:bg-x:hover", ".\32 xl\:p-4"), taken verbatim from its own output — never
  // hand-escaped, so it's correct for every case that engine handles, digit-leading classes
  // included.
  selector: string;
}

function selectorIn(compiledRule: string): string | undefined {
  const full = compiledRule.match(/\.[^{]+(?=\{)/)?.[0]?.trim();
  if (full === undefined) {
    return undefined;
  }
  // Everything from the first unescaped ":" onward is a pseudo-class/pseudo-element suffix, not
  // part of the class name itself, and a pseudo-element can be serialized two ways (":after" or
  // "::after") depending on the packaged build's own browser-compatibility transform — so it's
  // dropped rather than matched verbatim; the class name itself never contains an unescaped ":".
  const suffixStart = full.search(/(?<!\\):/);
  return suffixStart === -1 ? full : full.slice(0, suffixStart);
}

// The same scanner and compiler @tailwindcss/vite itself builds the app's CSS with (see its own
// source): the given theme decides what a candidate compiles to, so this finds and validates
// classes exactly as a real build would — a plain literal className, a *ClassName constant, a
// variant-map value, a function body, a template literal, an arbitrary-value or arbitrary-variant
// selector, anything Tailwind's own scanner recognizes, wherever it appears in a source file —
// with no hand-rolled shape rules to keep in sync with new patterns. candidatesToCss returns null
// for a scanned token that isn't actually a valid utility (an import specifier, a TS union
// member, a *ClassName record's own variant key, plain prose), so those are never even candidates
// to filter out by hand, and its own selector for a valid one is used verbatim, never
// re-escaped by hand.
async function scanUtilities(
  sourceDir: string,
  css: string,
  cssBase: string,
): Promise<ScannedUtility[]> {
  const designSystem = await __unstable__loadDesignSystem(css, { base: cssBase });
  const scanner = new Scanner({
    sources: [
      { base: sourceDir, pattern: "**/*", negated: false },
      { base: sourceDir, pattern: "**/*.test.tsx", negated: true },
    ],
  });
  const candidates = scanner.scan();
  const compiled = designSystem.candidatesToCss(candidates);

  const utilities: ScannedUtility[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const rule = compiled[index];
    if (rule === null || rule === undefined) {
      continue;
    }
    const selector = selectorIn(rule);
    if (selector !== undefined) {
      utilities.push({ candidate, selector });
    }
  }
  return utilities;
}

function designSystemUtilities(): Promise<ScannedUtility[]> {
  return scanUtilities(
    UI_COMPONENTS_DIR,
    readFileSync(UI_TOKENS_CSS, "utf8"),
    TAILWIND_RESOLUTION_BASE,
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A rule's selector is Tailwind's own exact output for one candidate (see selectorIn above), so
// matching it verbatim is enough on its own to tell a class from a longer class that merely
// starts with the same characters, as long as what follows the match isn't itself part of an
// identifier: ".gap-1" must never match inside ".gap-10{gap:2.5rem}" (a digit continues the
// name), but has to match a real suffix a variant or combinator can add after the class name
// itself — ":is(...)", "[data-x]", " > svg", a bare "{" — which selectorIn deliberately leaves
// out of the class name it returns.
function ruleExists(selector: string, stylesheet: string): boolean {
  return new RegExp(`${escapeRegExp(selector)}(?![A-Za-z0-9_\\\\-])`).test(stylesheet);
}

describe("the register's compiled stylesheet", () => {
  it("includes every utility class the design system's components use", async () => {
    const stylesheet = filesUnder(join(plainBuild(), "renderer"))
      .filter((file) => file.endsWith(".css"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const utilities = await designSystemUtilities();

    expect(utilities.length).toBeGreaterThan(0);
    expect(
      utilities
        .filter((utility) => !ruleExists(utility.selector, stylesheet))
        .map((u) => u.candidate),
    ).toEqual([]);
  }, 120_000);
});

describe("ruleExists", () => {
  it("matches a rule only by its whole selector, never a shorter selector's prefix", () => {
    expect(ruleExists(".gap-1", ".gap-10{gap:2.5rem}")).toBe(false);
    expect(ruleExists(".gap-1", ".gap-1{gap:0.25rem}")).toBe(true);
  });

  it("matches even when a variant or combinator suffix follows the class name in the real rule", () => {
    // selectorIn deliberately stops before a suffix like this (see its own comment), so matching
    // has to tolerate one following the class name here instead of requiring the class name to be
    // the entire selector.
    expect(
      ruleExists(
        ".group-data-\\[hovered\\]\\:bg-surface-bone",
        ".group-data-\\[hovered\\]\\:bg-surface-bone:is(:where(.group)[data-hovered] *){background-color:red}",
      ),
    ).toBe(true);
  });
});

describe("scanUtilities", () => {
  it("finds classes wherever a component builds them, not just a literal JSX className attribute", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "purosur-pos-class-scan-"));
    outputDirs.push(fixtureDir);
    writeFileSync(
      join(fixtureDir, "Widget.tsx"),
      [
        "export function Widget({ isFirst }: { isFirst: boolean }) {",
        "  return (",
        '    <div className="p-8">',
        "      <span className={rowClassName(isFirst)} />",
        "      <span className={contentClassName} />",
        '      <span className="[&>svg]:h-full" />',
        '      <span className="2xl:p-4" />',
        "    </div>",
        "  );",
        "}",
        "",
        "// A function body, not a *ClassName-named declaration.",
        "function rowClassName(isFirst: boolean): string {",
        '  return isFirst ? "pl-4" : "pl-1.5";',
        "}",
        "",
        "// A lowercase `const className = [...]`, not a *ClassName-named declaration.",
        'const className = ["border-l-4", "bg-surface-white"].join(" ");',
        "",
        "// A template literal, not a plain string.",
        // Split so this source string never contains a literal "${", which would otherwise read
        // as a template-literal placeholder biome expects inside backticks, not double quotes.
        "const contentClassName = `" + "$" + "{className} after:content-['*']`;",
        "",
      ].join("\n"),
    );

    const utilities = await scanUtilities(
      fixtureDir,
      '@import "tailwindcss";',
      TAILWIND_RESOLUTION_BASE,
    );
    const candidates = utilities.map((utility) => utility.candidate);

    expect(candidates).toEqual(
      expect.arrayContaining([
        "p-8",
        "pl-1.5",
        "border-l-4",
        "after:content-['*']",
        "[&>svg]:h-full",
        // A digit-leading variant: Tailwind's own CSS.escape-style output (`.\32 xl\:p-4`) is
        // exactly what a hand-escaping scheme (backslash before every non [A-Za-z0-9_-]
        // character) gets wrong, since a leading digit needs its own escape, not the variant
        // colon's.
        "2xl:p-4",
      ]),
    );
  }, 30_000);
});
