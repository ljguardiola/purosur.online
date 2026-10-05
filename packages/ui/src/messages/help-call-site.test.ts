import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

const helpModulePath = fileURLToPath(new URL("./help", import.meta.url));
const callSitesDir = fileURLToPath(new URL("./call-sites/", import.meta.url));

const compilerOptions: ts.CompilerOptions = {
  noEmit: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
  verbatimModuleSyntax: true,
  skipLibCheck: true,
  types: [],
};

const callSites = {
  "bad-category.ts": `defineHelp("es-AR", {
    categories: { getting_started: { label: "Primeros pasos" } },
    articles: { intro: { category: "ghost", title: "Bienvenida", body: [] } },
  });`,
  "bad-related.ts": `defineHelp("es-AR", {
    categories: { getting_started: { label: "Primeros pasos" } },
    articles: { intro: { category: "getting_started", title: "B", body: [], related: ["ghost"] } },
  });`,
  "bad-article-link.ts": `defineHelp("es-AR", {
    categories: { getting_started: { label: "Primeros pasos" } },
    articles: {
      intro: { category: "getting_started", title: "B", body: [{ kind: "articleLink", article: "ghost" }] } },
  });`,
  "valid.ts": `defineHelp("es-AR", {
    categories: { getting_started: { label: "Primeros pasos" }, billing: { label: "Facturación" } },
    articles: {
      intro: {
        category: "getting_started", title: "B", related: ["billing_basics"],
        body: [{ kind: "articleLink", article: "billing_basics" }],
      },
      billing_basics: { category: "billing", title: "B", body: [{ kind: "paragraph", text: "C" }] },
    },
  });`,
};

type CallSite = keyof typeof callSites;

const callSiteNames = Object.keys(callSites) as CallSite[];

function callSiteSource(callSite: CallSite): string {
  return `import { defineHelp } from ${JSON.stringify(helpModulePath)};\n\n${callSites[callSite]}\n`;
}

type TypeCheckResult = { errors: number; output: string };

const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => callSitesDir,
  getNewLine: () => "\n",
};

function typeCheckCallSites(): Map<CallSite, TypeCheckResult> {
  const host = ts.createCompilerHost(compilerOptions);
  const sources = new Map(
    callSiteNames.map((callSite) => [path.join(callSitesDir, callSite), callSiteSource(callSite)]),
  );
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = (fileName) => sources.get(fileName) ?? readFile(fileName);
  host.fileExists = (fileName) => sources.has(fileName) || fileExists(fileName);

  const program = ts.createProgram([...sources.keys()], compilerOptions, host);
  return new Map(
    callSiteNames.map((callSite) => {
      const sourceFile = program.getSourceFile(path.join(callSitesDir, callSite));
      if (!sourceFile) {
        throw new Error(`test setup: the compiler did not load the call site ${callSite}`);
      }
      const found = ts.getPreEmitDiagnostics(program, sourceFile);
      return [callSite, { errors: found.length, output: ts.formatDiagnostics(found, formatHost) }];
    }),
  );
}

let results: Map<CallSite, TypeCheckResult>;

beforeAll(() => {
  results = typeCheckCallSites();
});

function typeCheckCall(callSite: CallSite): TypeCheckResult {
  const result = results.get(callSite);
  if (!result) {
    throw new Error(`test setup: no type check result for the call site ${callSite}`);
  }
  return result;
}

describe("defineHelp's reference safety at the call site", () => {
  it("rejects a call whose article names a category it doesn't define", () => {
    const result = typeCheckCall("bad-category.ts");

    expect(result.errors).not.toBe(0);
    expect(result.output).toContain("ghost");
  });

  it("rejects a call whose related list names an article it doesn't define", () => {
    const result = typeCheckCall("bad-related.ts");

    expect(result.errors).not.toBe(0);
    expect(result.output).toContain("ghost");
  });

  it("rejects a call whose articleLink names an article it doesn't define", () => {
    const result = typeCheckCall("bad-article-link.ts");

    expect(result.errors).not.toBe(0);
    expect(result.output).toContain("ghost");
  });

  it("accepts a call whose category, related entry, and articleLink all point at real ids", () => {
    const result = typeCheckCall("valid.ts");

    expect(result.errors).toBe(0);
    expect(result.output).toBe("");
  });
});
