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

// Scans forward from just inside an opening "{" (a JSX `className={` expression) for its matching
// close, counting brace depth so nested braces — an object/array literal, a template literal's
// `${...}` — don't end the span early. None of the classes below ever contain "{" or "}"
// themselves, so counting braces alone (ignoring string context) is enough.
function balancedBraceSpan(source: string, openBraceIndex: number): string {
  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBraceIndex + 1, index);
      }
    }
  }
  return source.slice(openBraceIndex + 1);
}

// Scans forward from just after the "=" of a `*ClassName = ...;` declaration for its terminating
// top-level ";", tracking bracket depth so a Record<...> object literal's own punctuation doesn't
// end the span early.
function declarationSpan(source: string, afterEqualsIndex: number): string {
  let depth = 0;
  for (let index = afterEqualsIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{" || character === "[" || character === "(") {
      depth += 1;
    } else if (character === "}" || character === "]" || character === ")") {
      depth -= 1;
    } else if (character === ";" && depth <= 0) {
      return source.slice(afterEqualsIndex, index);
    }
  }
  return source.slice(afterEqualsIndex);
}

// Class-bearing text lives in exactly two shapes in packages/ui's components: a JSX
// `className={...}` expression, and a declaration whose identifier contains "ClassName"
// (case-sensitively, so the lowercase `className` prop/attribute itself never matches). Scanning
// only inside these regions is what keeps every other string literal in the file — TS union
// members, a *ClassName record's own variant keys, React `key`s, a plain function argument, an
// import specifier — out of the candidate set, without having to recognize each of those shapes
// by name.
function classBearingRegions(source: string): string[] {
  const regions: string[] = [];
  for (const match of source.matchAll(/\bclassName=\{/g)) {
    regions.push(balancedBraceSpan(source, match.index + match[0].length - 1));
  }
  for (const match of source.matchAll(/\b[$\w]*ClassName[$\w]*\s*(?::[^=\n]*)?=\s*/g)) {
    regions.push(declarationSpan(source, match.index + match[0].length));
  }
  return regions;
}

// A Tailwind utility (including a variant prefix and an arbitrary value) is lowercase and built
// only from these characters. A bare word with none of "-", ":" or "[" is excluded even when it's
// shaped like one (e.g. a one-word utility such as "flex"): it reads exactly the same as ordinary
// prose (e.g. "content"), and there is no way to tell them apart from characters alone, so this
// trades a little recall for never reporting an English word as a missing class.
const UTILITY_TOKEN = /^-?[a-z][a-z0-9:/.\-[\]_%!()]*$/;

function looksLikeUtilityClass(token: string): boolean {
  if (token === "" || token.startsWith("aria-")) {
    return false;
  }
  return /[-:[]/.test(token) && UTILITY_TOKEN.test(token);
}

// The candidate tokens a source file's `className={...}` expressions and `*ClassName`
// declarations use, minus each declaration's own variant keys (e.g. `"plain-text"` in
// TextField.tsx's `frameClassName` record) and anything that doesn't look like a utility class.
function utilityClassesIn(source: string): string[] {
  const classes = new Set<string>();
  for (const region of classBearingRegions(source)) {
    for (const match of region.matchAll(/"([^"]*)"(\s*:)?/g)) {
      if (match[2]) {
        continue;
      }
      for (const token of (match[1] ?? "").split(/\s+/)) {
        if (looksLikeUtilityClass(token)) {
          classes.add(token);
        }
      }
    }
  }
  return [...classes];
}

function designSystemUtilityClasses(): string[] {
  const classes = new Set<string>();
  for (const file of filesUnder(UI_COMPONENTS_DIR)) {
    if (!file.endsWith(".tsx") || file.endsWith(".test.tsx")) {
      continue;
    }
    for (const name of utilityClassesIn(readFileSync(file, "utf8"))) {
      classes.add(name);
    }
  }
  return [...classes];
}

// Tailwind writes a class name into its selector with every character outside [A-Za-z0-9_-]
// backslash-escaped (`hover:x` becomes `.hover\:x`, `w-2/5` becomes `.w-2\/5`).
function selectorFor(name: string): RegExp {
  const escaped = name.replace(/[^A-Za-z0-9_-]/g, (character) => `\\${character}`);
  const pattern = escaped.replace(/[\\^$.*+?()[\]{}|/]/g, (character) => `\\${character}`);
  return new RegExp(`\\.${pattern}(?![A-Za-z0-9_\\\\-])`);
}

describe("the register's compiled stylesheet", () => {
  it("includes every utility class the design system's components use", () => {
    const stylesheet = filesUnder(join(plainBuild(), "renderer"))
      .filter((file) => file.endsWith(".css"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const classes = designSystemUtilityClasses();

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

describe("utilityClassesIn", () => {
  it("extracts classes from a *ClassName string constant, including concatenated pieces", () => {
    const source = 'const trackClassName =\n  "items-center gap-3 " +\n  "outline-none";';

    expect(utilityClassesIn(source)).toEqual(
      expect.arrayContaining(["items-center", "gap-3", "outline-none"]),
    );
  });

  it("extracts classes from a className={...} expression, including array-join and template forms", () => {
    const source =
      "function Row() {\n" +
      '  return <span className={["min-w-0", colorClassName].join(" ")} />;\n' +
      "}";

    expect(utilityClassesIn(source)).toEqual(expect.arrayContaining(["min-w-0"]));
  });

  it("keeps a *ClassName record's class values but drops its variant keys", () => {
    const source =
      "const frameClassName: Record<Kind, string> = {\n" +
      '  "plain-text": "h-[3.25rem] px-4",\n' +
      "};";

    const classes = utilityClassesIn(source);

    expect(classes).toEqual(expect.arrayContaining(["h-[3.25rem]", "px-4"]));
    expect(classes).not.toContain("plain-text");
  });

  it("ignores a string literal that isn't part of a className expression or a *ClassName declaration", () => {
    const source = 'export type ModalContextTone = "brand-blue-ui" | "brand-earth-ui";';

    expect(utilityClassesIn(source)).toEqual([]);
  });

  it("ignores an import specifier, even one shaped like a hyphenated class list", () => {
    const source = 'import { Switch as AriaSwitch } from "react-aria-components";';

    expect(utilityClassesIn(source)).toEqual([]);
  });

  it("ignores an aria- attribute name inside a className expression", () => {
    const source = 'const x = <span className={isOpen ? "aria-hidden" : "inline-flex"} />;';

    const classes = utilityClassesIn(source);

    expect(classes).not.toContain("aria-hidden");
    expect(classes).toContain("inline-flex");
  });

  it("ignores a bare word that reads as prose, keeping only compound utility-shaped tokens", () => {
    const source = 'const noticeClassName = "content flex gap-2";';

    const classes = utilityClassesIn(source);

    expect(classes).not.toContain("content");
    expect(classes).not.toContain("flex");
    expect(classes).toContain("gap-2");
  });
});
