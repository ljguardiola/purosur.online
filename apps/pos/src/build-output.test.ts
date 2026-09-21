import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { type Selector, type SelectorComponent, transform } from "lightningcss";
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
// The directory every css string passed to __unstable__loadDesignSystem below resolves its
// `@import`s from — packages/ui's own styles directory, whether that's the real tokens.css (the
// natural choice, being its own directory) or a minimal "@import tailwindcss;" theme for a test
// fixture (packages/ui's package.json already depends on tailwindcss, so it resolves from here
// too, without apps/pos needing its own dependency on it).
const TAILWIND_RESOLUTION_BASE = dirname(UI_TOKENS_CSS);

interface ScanResult {
  candidates: string[];
  // The compiled CSS for exactly those candidates (candidatesToCss run once, here, while
  // computing which scanned tokens are valid utilities) — callers that also need it (the fixture
  // test) reuse it instead of loading the design system and recompiling a second time.
  compiledCss: string;
}

// The same scanner and compiler @tailwindcss/vite itself builds the app's CSS with (see its own
// source): the given theme decides what a candidate compiles to, so this finds and validates
// classes exactly as a real build would — a plain literal className, a *ClassName constant, a
// variant-map value, a function body, a template literal, an arbitrary-value or arbitrary-variant
// selector, anything Tailwind's own scanner recognizes, wherever it appears in a source file —
// with no hand-rolled shape rules to keep in sync with new patterns. candidatesToCss returns null
// for a scanned token that isn't actually a valid utility (an import specifier, a TS union
// member, a *ClassName record's own variant key, plain prose), so those are never even candidates
// this test has to account for.
async function scanCandidates(
  sourceDir: string,
  css: string,
  cssBase: string,
): Promise<ScanResult> {
  const designSystem = await __unstable__loadDesignSystem(css, { base: cssBase });
  const scanner = new Scanner({
    sources: [
      { base: sourceDir, pattern: "**/*", negated: false },
      { base: sourceDir, pattern: "**/*.test.tsx", negated: true },
    ],
  });
  const scanned = scanner.scan();
  const compiled = designSystem.candidatesToCss(scanned);

  const candidates: string[] = [];
  const rules: string[] = [];
  for (const [index, candidate] of scanned.entries()) {
    const rule = compiled[index];
    if (rule !== null && rule !== undefined) {
      candidates.push(candidate);
      rules.push(rule);
    }
  }
  return { candidates, compiledCss: rules.join("\n") };
}

async function designSystemCandidates(): Promise<string[]> {
  const result = await scanCandidates(
    UI_COMPONENTS_DIR,
    readFileSync(UI_TOKENS_CSS, "utf8"),
    TAILWIND_RESOLUTION_BASE,
  );
  return result.candidates;
}

// Pseudo-classes like :is(), :where(), :not() and :has() (and an explicit nth-child(...of ...))
// carry their own nested selector list — this is where the *:/**: variants and space-*/divide-*
// (a :where(.space-x-4 > :not(:last-child)) shape, two levels deep) actually put their class. A
// class there is exactly as real as one at the top level of a selector, so it has to be collected
// too, not just ignored as "context".
function nestedSelectorsOf(component: SelectorComponent): Selector[] {
  if (component.type !== "pseudo-class") {
    return [];
  }
  switch (component.kind) {
    case "is":
    case "where":
    case "not":
    case "has":
    case "any":
      return component.selectors;
    case "nth-child":
    case "nth-last-child":
      return component.of ?? [];
    case "host":
      return component.selectors ? [component.selectors] : [];
    default:
      return [];
  }
}

function collectClassNames(selector: Selector, names: Set<string>): void {
  for (const component of selector) {
    if (component.type === "class") {
      names.add(component.name);
      continue;
    }
    for (const nested of nestedSelectorsOf(component)) {
      collectClassNames(nested, names);
    }
  }
}

// The unescaped class names any selector in the given CSS uses, collected with Lightning CSS's
// own selector-AST visitor — the same parser Tailwind's compiler and optimizer are built on (see
// @tailwindcss/node's own package.json: it pins lightningcss). This is not text matching: there is
// no selector text to escape, truncate, or search for a boundary around, and the visitor walks
// into every at-rule (@media, @supports, @layer, @container, ...) on its own, so a class nested
// arbitrarily deep — in an at-rule or in a pseudo-class's own selector list — is still found.
// `minify` lets a caller prove that minifying the CSS first (as the packaged build does) doesn't
// change which classes are found.
function classNamesIn(css: string, minify = false): Set<string> {
  const names = new Set<string>();
  transform({
    filename: "stylesheet.css",
    code: Buffer.from(css),
    minify,
    visitor: {
      Selector(selector) {
        collectClassNames(selector, names);
      },
    },
  });
  return names;
}

describe("the register's compiled stylesheet", () => {
  it("includes every utility class the design system's components use", async () => {
    const stylesheet = filesUnder(join(plainBuild(), "renderer"))
      .filter((file) => file.endsWith(".css"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const classNames = classNamesIn(stylesheet);
    const candidates = await designSystemCandidates();

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.filter((candidate) => !classNames.has(candidate))).toEqual([]);
  }, 120_000);
});

describe("classNamesIn", () => {
  it("collects a class name from a plain rule", () => {
    expect(classNamesIn(".gap-1{gap:0.25rem}")).toEqual(new Set(["gap-1"]));
  });

  it("does not confuse one class with a longer class that starts with the same characters", () => {
    expect(classNamesIn(".gap-10{gap:2.5rem}").has("gap-1")).toBe(false);
  });

  it("walks into every at-rule a real utility can be nested inside", () => {
    const css = [
      "@media (width >= 96rem) { .in-media { color: red; } }",
      "@supports (color: red) { .in-supports { color: red; } }",
      "@layer utilities { .in-layer { color: red; } }",
      "@container (min-width: 1.5rem) { .in-container { color: red; } }",
    ].join("\n");

    const names = classNamesIn(css);

    expect(names).toEqual(new Set(["in-media", "in-supports", "in-layer", "in-container"]));
  });

  it("collects the unescaped class name regardless of how it's escaped or what follows it", () => {
    const css = [
      // A digit-leading class: CSS's own codepoint escape (`\32 ` = hex 0x32 = "2"), not a
      // per-character backslash.
      String.raw`.\32 xl\:p-4{padding:1rem}`,
      // A pseudo-element suffix, serialized either way depending on the build's own
      // browser-compatibility transform.
      String.raw`.after\:content-\[\'\*\'\]::after{content:"*"}`,
      String.raw`.after\:content-\[\'\*\'\]:after{content:"*"}`,
      // An arbitrary-variant combinator suffix.
      String.raw`.\[\&\>svg\]\:h-full > svg{height:100%}`,
      // A trailing :is(...)/attribute-selector suffix, as a group-data-[...] variant compiles to.
      String.raw`.group-data-\[selected\]\:bg-red-500:is(:where(.group)[data-selected] *){color:red}`,
    ].join("\n");

    const names = classNamesIn(css);

    expect(names).toEqual(
      new Set([
        "2xl:p-4",
        "after:content-['*']",
        "[&>svg]:h-full",
        // Nested inside the group-data variant's own :where(.group)[data-selected] — see the
        // "descends into..." test below for why a class inside a pseudo-class's own selector list
        // is collected too, not just this one's top-level class.
        "group",
        "group-data-[selected]:bg-red-500",
      ]),
    );
  });

  it("descends into a pseudo-class's own nested selector list, not just top-level classes", () => {
    // *:p-4 and **:p-4 (the `*:`/`**:` variants) compile inside :is(...); space-x-4/divide-*
    // compile inside :where(...) with a further nested :not(...) — two levels deep. A class here
    // is exactly as real as one at the top level of a selector: it's still what the compiled CSS
    // actually uses, so missing it would be a false failure for the guard's one job (an @source
    // regression drops every packages/ui class at once, not just top-level ones).
    const css = [
      ":is(.\\*\\:p-4 > *){padding:1rem}",
      ":where(.space-x-4 > :not(:last-child)){margin:1rem}",
    ].join("\n");

    expect(classNamesIn(css)).toEqual(new Set(["*:p-4", "space-x-4"]));
  });

  it("finds the same classes whether the CSS is minified or not", () => {
    const css = ".gap-1{gap:0.25rem}\n@media (width >= 96rem) { .in-media { color: red; } }";

    expect(classNamesIn(css, true)).toEqual(classNamesIn(css, false));
  });

  it("reports a class actually absent from the CSS as absent, never silently", () => {
    expect(classNamesIn(".gap-1{gap:0.25rem}").has("this-class-does-not-exist")).toBe(false);
  });
});

describe("scanCandidates and classNamesIn end to end", () => {
  it("scans, compiles, minifies and matches classes the same way the real guard does", async () => {
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
        '      <span className="[&_>_svg]:h-full" />',
        '      <span className="2xl:p-4" />',
        '      <span className="min-[1.5rem]:p-4" />',
        '      <span className="group-data-[selected]:bg-red-500" />',
        '      <span className="*:p-4" />',
        '      <span className="space-x-4" />',
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
    const css = '@import "tailwindcss";';

    const { candidates, compiledCss } = await scanCandidates(
      fixtureDir,
      css,
      TAILWIND_RESOLUTION_BASE,
    );
    const expectedCandidates = [
      "p-8",
      "pl-1.5",
      "border-l-4",
      "after:content-['*']",
      "[&>svg]:h-full",
      "[&_>_svg]:h-full",
      // A digit-leading variant: Tailwind's own escape for it (`.\32 xl\:p-4`) is exactly what a
      // hand-escaping scheme (backslash before every non [A-Za-z0-9_-] character) gets wrong.
      "2xl:p-4",
      // Its own compiled rule's @container prelude contains a decimal point ("1.5rem") before the
      // rule's actual selector — exactly what previously broke a "first '.' before '{'" selector
      // search.
      "min-[1.5rem]:p-4",
      // Its own class is nested inside :is(:where(.group)[data-selected] *), not top-level.
      "group-data-[selected]:bg-red-500",
      // Compiles inside :is(...) (the `*:` variant) — a class nested one level deep.
      "*:p-4",
      // Compiles inside :where(.space-x-4 > :not(:last-child)) — nested two levels deep.
      "space-x-4",
    ];
    expect(candidates).toEqual(expect.arrayContaining(expectedCandidates));

    // Minified, like the packaged build's own CSS, to prove minification doesn't change which
    // classes are found.
    const classNames = classNamesIn(compiledCss, true);

    for (const candidate of expectedCandidates) {
      expect(classNames.has(candidate)).toBe(true);
    }
    // A class genuinely absent from the compiled CSS has to be reported missing, not silently
    // accepted.
    expect(classNames.has("this-class-does-not-exist")).toBe(false);
  }, 30_000);
});
