import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const biomeBinary = join(repositoryRoot, "node_modules", ".bin", "biome");

// Biome's path-based overrides (packages/ui/**, apps/pos/src/renderer/**) only match a file at its
// real relative path, so the fixture is written under a project root that mirrors that path instead
// of a flat temp file: a future override that disables a React rule for one root would fail this.
function projectRoot() {
  const config = JSON.parse(readFileSync(join(repositoryRoot, "biome.json"), "utf8"));
  delete config.$schema;
  config.vcs = { enabled: false, clientKind: "git", useIgnoreFile: false };

  const root = mkdtempSync(join(tmpdir(), "react-lint-rules-"));
  writeFileSync(join(root, "biome.json"), JSON.stringify(config, null, 2));
  return root;
}

function lint(relativeDir, source, fileName = "lint-fixture.tsx") {
  const root = projectRoot();
  try {
    const dir = join(root, relativeDir);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);

    const result = spawnSync(
      biomeBinary,
      ["lint", filePath, `--config-path=${root}`, "--reporter=json", "--error-on-warnings"],
      { encoding: "utf8" },
    );
    const report = JSON.parse(result.stdout);
    return {
      exitCode: result.status,
      categories: report.diagnostics.map((diagnostic) => diagnostic.category),
      severities: report.diagnostics.map((diagnostic) => diagnostic.severity),
      messages: report.diagnostics.map((diagnostic) => diagnostic.message),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const CLEAN_SOURCE = [
  'import { useEffect, useState } from "react";',
  "",
  "export function Counter({ step }: { step: number }) {",
  "  const [count, setCount] = useState(0);",
  "",
  "  useEffect(() => {",
  "    document.title = String(count);",
  "  }, [count]);",
  "",
  "  function increment() {",
  "    setCount(count + step);",
  "  }",
  "",
  "  return (",
  '    <button type="button" onClick={increment}>',
  "      {count}",
  "    </button>",
  "  );",
  "}",
  "",
].join("\n");

const MISTAKES_SOURCE = [
  'import { forwardRef, useEffect, useState } from "react";',
  "",
  "function NestedInside() {",
  "  function Nested() {",
  "    return <span>nested</span>;",
  "  }",
  "  return <Nested />;",
  "}",
  "",
  "export function Mistakes({ items, active }: { items: string[]; active: number }) {",
  "  const [count, setCount] = useState(0);",
  "",
  "  if (active > 0) {",
  "    useEffect(() => {}, []);",
  "  }",
  "",
  "  useEffect(() => {",
  "    console.log(count);",
  "  }, []);",
  "",
  "  return (",
  '    <div id="mistakes-root">',
  "      {active && <span>{active}</span>}",
  "      <ul>",
  "        {items.map((item) => (",
  "          <li>{item}</li>",
  "        ))}",
  "      </ul>",
  "      <NestedInside />",
  "    </div>",
  "  );",
  "}",
  "",
  "export const Labeled = forwardRef<HTMLSpanElement, { text: string }>(function Labeled(",
  "  { text },",
  "  ref,",
  ") {",
  "  return <span ref={ref}>{text}</span>;",
  "});",
  "",
].join("\n");

const EXPECTED_MISTAKE_CATEGORIES = [
  "lint/correctness/useHookAtTopLevel",
  "lint/correctness/useExhaustiveDependencies",
  "lint/correctness/useJsxKeyInIterable",
  "lint/suspicious/noLeakedRender",
  "lint/suspicious/noReactForwardRef",
  "lint/correctness/useUniqueElementIds",
  "lint/correctness/noNestedComponentDefinitions",
];

const INFO_BY_DEFAULT_SOURCE = [
  'import { Component } from "react";',
  "",
  "export class Greeting extends Component<{ name: string }> {",
  "  override render() {",
  '    return <p>{"Hola, " + this.props.name}</p>;',
  "  }",
  "}",
  "",
].join("\n");

const INFO_BY_DEFAULT_CATEGORIES = [
  "lint/style/useReactFunctionComponents",
  "lint/style/useTemplate",
];

const ROOTS = [
  { label: "apps/backoffice", relativeDir: "apps/backoffice/src" },
  { label: "apps/pos/src/renderer", relativeDir: "apps/pos/src/renderer" },
  { label: "packages/ui", relativeDir: "packages/ui/src" },
];

for (const { label, relativeDir } of ROOTS) {
  test(`${label}: clean React code passes the react domain rules verify runs`, () => {
    const { exitCode, categories } = lint(relativeDir, CLEAN_SOURCE);

    assert.deepEqual(categories, []);
    assert.equal(exitCode, 0);
  });

  test(`${label}: representative React mistakes are reported and fail under verify's flags`, () => {
    const { exitCode, categories } = lint(relativeDir, MISTAKES_SOURCE);

    for (const expected of EXPECTED_MISTAKE_CATEGORIES) {
      assert.ok(categories.includes(expected), `expected ${expected} in ${categories.join(", ")}`);
    }
    assert.notEqual(exitCode, 0);
  });

  test(`${label}: rules Biome reports as info by default are raised to errors`, () => {
    const { exitCode, categories, severities } = lint(relativeDir, INFO_BY_DEFAULT_SOURCE);

    assert.deepEqual([...categories].sort(), INFO_BY_DEFAULT_CATEGORIES);
    assert.deepEqual(severities, ["error", "error"]);
    assert.notEqual(exitCode, 0);
  });
}

const UI_FORBIDDEN_PACKAGES = [
  {
    name: "domain",
    specifiers: ["@purosur/domain", "@purosur/domain/money", "@purosur/domain/catalog/sale-unit"],
  },
  {
    name: "contracts",
    specifiers: [
      "@purosur/contracts",
      "@purosur/contracts/catalog",
      "@purosur/contracts/catalog/product-creation",
    ],
  },
];

function importing(specifier) {
  return `import { rule } from "${specifier}";\n\nexport const used = rule;\n`;
}

for (const { name, specifiers } of UI_FORBIDDEN_PACKAGES) {
  for (const specifier of specifiers) {
    test(`packages/ui: importing ${specifier} fails under verify's flags`, () => {
      const { exitCode, categories, messages } = lint("packages/ui/src", importing(specifier));

      assert.deepEqual(categories, ["lint/style/noRestrictedImports"]);
      assert.deepEqual(messages, [`packages/ui must not depend on packages/${name}.`]);
      assert.notEqual(exitCode, 0);
    });

    test(`apps/backoffice: importing ${specifier} is not restricted`, () => {
      const { exitCode, categories } = lint("apps/backoffice/src", importing(specifier));

      assert.deepEqual(categories, []);
      assert.equal(exitCode, 0);
    });
  }
}

test("apps/pos/src/main: importing errorReportingOptions from @purosur/contracts passes", () => {
  const source = [
    'import { errorReportingOptions } from "@purosur/contracts";',
    "",
    "export const used = errorReportingOptions;",
    "",
  ].join("\n");

  const { exitCode, categories } = lint("apps/pos/src/main", source);

  assert.deepEqual(categories, []);
  assert.equal(exitCode, 0);
});

test("apps/pos/src/main: importing anything else from @purosur/contracts fails under verify's flags", () => {
  const source = [
    'import { errorReportingOptions, scrubErrorReport } from "@purosur/contracts";',
    "",
    "export const used = [errorReportingOptions, scrubErrorReport];",
    "",
  ].join("\n");

  const { exitCode, categories } = lint("apps/pos/src/main", source);

  assert.deepEqual(categories, ["lint/style/noRestrictedImports"]);
  assert.notEqual(exitCode, 0);
});

const LAZY_ROUTE_COMPONENT_SOURCE =
  'import { lazyRouteComponent } from "@tanstack/react-router";\n\nexport const screen = lazyRouteComponent(() => import("./page"), "Page");\n';

test("apps/backoffice: importing lazyRouteComponent fails and points to lazyScreen", () => {
  const { exitCode, categories, messages } = lint(
    "apps/backoffice/src/alerts",
    LAZY_ROUTE_COMPONENT_SOURCE,
  );

  assert.deepEqual(categories, ["lint/style/noRestrictedImports"]);
  assert.match(messages[0], /lazyScreen/);
  assert.notEqual(exitCode, 0);
});

test("apps/backoffice: shell/lazy-screen.ts may import lazyRouteComponent", () => {
  const { exitCode, categories } = lint(
    "apps/backoffice/src/shell",
    LAZY_ROUTE_COMPONENT_SOURCE,
    "lazy-screen.ts",
  );

  assert.deepEqual(categories, []);
  assert.equal(exitCode, 0);
});
