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
// Base for every css string's `@import`s below: packages/ui's styles directory, so a fixture
// theme resolves tailwindcss from its dependency instead of apps/pos needing its own.
const TAILWIND_RESOLUTION_BASE = dirname(UI_TOKENS_CSS);

interface ScanResult {
  candidates: string[];
  // The compiled CSS for exactly the returned candidates.
  compiledCss: string;
}

// The same scanner and compiler @tailwindcss/vite builds the app's CSS with; candidatesToCss
// returns null for a scanned token that isn't actually a utility, so it's never a candidate here.
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

// :is(), :where(), :not(), :has() and nth-child(...of ...) carry their own nested selector list,
// which is where variants like *:/**: and space-*/divide-* actually put their class.
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

// Collected from Lightning CSS's selector AST rather than by matching selector text; `minify`
// flattens nested rules the way the packaged build's own optimizer does.
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
        "group",
        "group-data-[selected]:bg-red-500",
      ]),
    );
  });

  it("descends into a pseudo-class's own nested selector list, not just top-level classes", () => {
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
      "2xl:p-4",
      "min-[1.5rem]:p-4",
      "group-data-[selected]:bg-red-500",
      "*:p-4",
      "space-x-4",
    ];
    expect(candidates).toEqual(expect.arrayContaining(expectedCandidates));

    const classNames = classNamesIn(compiledCss, true);

    for (const candidate of expectedCandidates) {
      expect(classNames.has(candidate)).toBe(true);
    }
    expect(classNames.has("this-class-does-not-exist")).toBe(false);
  }, 30_000);
});
