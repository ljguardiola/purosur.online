import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { cruise } from "dependency-cruiser";
import extractTSConfig from "dependency-cruiser/config-utl/extract-ts-config";
import config, { CLOUD_ONLY_CONCEPTS } from "../../.dependency-cruiser.mjs";

async function writeFixtureFile(root, relativePath, content) {
  const filePath = join(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

// Installs a package the way pnpm actually lays it out on disk: the real
// files live under node_modules/.pnpm/<name>@<version>/node_modules/<name>/,
// and node_modules/<name> is a symlink into that store entry. dependency-cruiser
// follows symlinks (enhanced-resolve's default), so the *resolved* path a rule
// sees for an installed package looks like
// "node_modules/.pnpm/electron@1.0.0/node_modules/electron/index.js", not the
// bare specifier "electron" - a real regression surface for any pattern that
// assumes the resolved path itself starts with the package name.
async function installPnpmPackage(root, packageName) {
  const storeDirName = `${packageName.replace("/", "+")}@1.0.0`;
  const realDir = join(root, "node_modules/.pnpm", storeDirName, "node_modules", packageName);
  await mkdir(realDir, { recursive: true });
  await writeFile(
    join(realDir, "package.json"),
    JSON.stringify({ name: packageName, version: "1.0.0", main: "index.js" }),
  );
  await writeFile(join(realDir, "index.js"), "module.exports = {};\n");

  const linkPath = join(root, "node_modules", packageName);
  await mkdir(dirname(linkPath), { recursive: true });
  await symlink(realDir, linkPath, "dir");
}

// Every fixture gets the tsconfig.json the repository's options name; a fixture
// that needs TypeScript path-alias resolution (an `@purosur/*` import) provides
// its own with an explicit baseUrl, so resolution doesn't depend on the
// process's current working directory.
async function makeFixture(t, files) {
  const root = await mkdtemp(join(tmpdir(), "depcruise-fixture-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const withTsConfig = { [config.options.tsConfig.fileName]: "{}\n", ...files };
  for (const [relativePath, content] of Object.entries(withTsConfig)) {
    await writeFixtureFile(root, relativePath, content);
  }
  return root;
}

// Cruises a fixture with the repository's real rules and options, overriding
// only what has to point into the fixture: baseDir and the tsconfig.json path.
async function cruiseFixture(root, dirs) {
  const tsConfigFileName = join(root, config.options.tsConfig.fileName);
  const result = await cruise(
    dirs,
    {
      ...config.options,
      tsConfig: { ...config.options.tsConfig, fileName: tsConfigFileName },
      baseDir: root,
      outputType: "json",
      validate: true,
      ruleSet: { forbidden: config.forbidden },
    },
    undefined,
    { tsConfig: extractTSConfig(tsConfigFileName) },
  );

  return JSON.parse(result.output);
}

function violationsFor(report, ruleName) {
  return report.summary.violations.filter((violation) => violation.rule.name === ruleName);
}

test("domain-is-pure flags everything outside packages/domain/src and allows what stays inside it", async (t) => {
  const root = await makeFixture(t, {
    "packages/domain/src/sales/model/order.ts": [
      'import { readFileSync } from "node:fs";',
      'import { Button } from "@purosur/ui";',
      'import { helper } from "../../../../../apps/pos/src/helper";',
      'import installed from "installed-npm-lib";',
      'import unresolved from "unresolved-npm-lib";',
      "export function loadOrder() {",
      "  return [readFileSync, Button, helper, installed, unresolved];",
      "}",
    ].join("\n"),
    "packages/domain/src/sales/model/helper.ts": "export function helper() {}\n",
    "packages/domain/src/returns/index.ts": "export function refund() {}\n",
    "packages/ui/src/index.ts": "export const Button = {};\n",
    "apps/pos/src/helper.ts": "export function helper() {}\n",
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@purosur/ui": ["./packages/ui/src/index.ts"],
        },
      },
    }),
  });
  await installPnpmPackage(root, "installed-npm-lib");

  const report = await cruiseFixture(root, ["packages", "apps"]);
  const violations = violationsFor(report, "domain-is-pure");
  const violationTargets = violations.map((violation) => violation.to);

  assert.equal(violations.length, 5);
  assert.equal(violationTargets.includes("fs"), true);
  assert.equal(violationTargets.includes("packages/ui/src/index.ts"), true);
  assert.equal(violationTargets.includes("apps/pos/src/helper.ts"), true);
  assert.equal(violationTargets.includes("unresolved-npm-lib"), true);
  assert.equal(
    violationTargets.some((to) => to.endsWith("node_modules/installed-npm-lib/index.js")),
    true,
  );

  await writeFixtureFile(
    root,
    "packages/domain/src/sales/model/order.ts",
    [
      'import { helper } from "./helper";',
      'import { refund } from "../../returns/index";',
      "export function loadOrder() {",
      "  return [helper, refund];",
      "}",
    ].join("\n"),
  );
  const controlReport = await cruiseFixture(root, ["packages", "apps"]);
  assert.equal(violationsFor(controlReport, "domain-is-pure").length, 0);
});

test("domain-is-pure flags a type-only import of an npm package", async (t) => {
  const root = await makeFixture(t, {
    "packages/domain/src/sales/model/order.ts": [
      'import type { ZodType } from "zod";',
      "export type Order = ZodType;",
    ].join("\n"),
  });

  const report = await cruiseFixture(root, ["packages"]);
  const violations = violationsFor(report, "domain-is-pure");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].to, "zod");
});

test("a test file importing a forbidden module breaks no rule", async (t) => {
  const root = await makeFixture(t, {
    "packages/domain/src/sales/model/order.test.ts": [
      'import { readFileSync } from "node:fs";',
      'import { Button } from "../../../../ui/src/index";',
      "export const deps = [readFileSync, Button];",
    ].join("\n"),
    "packages/ui/src/index.ts": "export const Button = {};\n",
  });

  const report = await cruiseFixture(root, ["packages"]);

  assert.deepEqual(report.summary.violations, []);
});

test("apps-to-packages-only flags packages importing an app and allows the reverse", async (t) => {
  const root = await makeFixture(t, {
    "packages/ui/src/index.ts":
      'import { helper } from "../../../apps/pos/src/helper";\nexport { helper };\n',
    "apps/pos/src/helper.ts": "export function helper() {}\n",
  });

  const report = await cruiseFixture(root, ["packages", "apps"]);
  const violations = violationsFor(report, "apps-to-packages-only");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].to, "apps/pos/src/helper.ts");

  await writeFixtureFile(root, "packages/ui/src/index.ts", "export function helper() {}\n");
  await writeFixtureFile(
    root,
    "apps/pos/src/helper.ts",
    'import { helper } from "../../../packages/ui/src/index";\nexport { helper };\n',
  );
  const controlReport = await cruiseFixture(root, ["packages", "apps"]);
  assert.equal(violationsFor(controlReport, "apps-to-packages-only").length, 0);
});

test("no-app-to-app flags one app importing another and allows importing within the same app", async (t) => {
  const root = await makeFixture(t, {
    "apps/pos/src/a.ts": 'import { b } from "../../backoffice/src/b";\nexport { b };\n',
    "apps/backoffice/src/b.ts": "export function b() {}\n",
  });

  const report = await cruiseFixture(root, ["apps"]);
  const violations = violationsFor(report, "no-app-to-app");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].to, "apps/backoffice/src/b.ts");

  await writeFixtureFile(root, "apps/pos/src/a.ts", 'import { c } from "./c";\nexport { c };\n');
  await writeFixtureFile(root, "apps/pos/src/c.ts", "export function c() {}\n");
  const controlReport = await cruiseFixture(root, ["apps"]);
  assert.equal(violationsFor(controlReport, "no-app-to-app").length, 0);
});

test("domain-not-contracts flags domain importing contracts and allows contracts importing domain via its alias", async (t) => {
  const root = await makeFixture(t, {
    "packages/domain/src/sales/model/order.ts": [
      'import type { OrderContract } from "../../../../contracts/src/index";',
      "export type Order = OrderContract;",
    ].join("\n"),
    "packages/contracts/src/index.ts": "export type OrderContract = { id: string };\n",
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@purosur/domain": ["./packages/domain/src/index.ts"],
          "@purosur/domain/*": ["./packages/domain/src/*"],
        },
      },
    }),
    "packages/domain/src/index.ts": "export type Id = string;\n",
  });

  const report = await cruiseFixture(root, ["packages"]);
  const violations = violationsFor(report, "domain-not-contracts");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].to, "packages/contracts/src/index.ts");

  await writeFixtureFile(
    root,
    "packages/domain/src/sales/model/order.ts",
    "export type Order = { id: string };\n",
  );
  await writeFixtureFile(
    root,
    "packages/contracts/src/index.ts",
    ['import type { Id } from "@purosur/domain";', "export type OrderContract = { id: Id };"].join(
      "\n",
    ),
  );
  const controlReport = await cruiseFixture(root, ["packages"]);
  const controlViolations = violationsFor(controlReport, "domain-not-contracts");

  assert.equal(controlViolations.length, 0);
  const contractsModule = controlReport.modules.find(
    (module) => module.source === "packages/contracts/src/index.ts",
  );
  assert.equal(contractsModule.dependencies[0].resolved, "packages/domain/src/index.ts");
});

test("model-not-use-cases flags model depending on its own concept's use-cases and allows the reverse", async (t) => {
  const root = await makeFixture(t, {
    "packages/domain/src/sales/model/order.ts": [
      'import { createOrder } from "../use-cases/create-order";',
      "export function order() {",
      "  return createOrder();",
      "}",
    ].join("\n"),
    "packages/domain/src/sales/use-cases/create-order.ts": "export function createOrder() {}\n",
  });

  const report = await cruiseFixture(root, ["packages"]);
  const violations = violationsFor(report, "model-not-use-cases");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].to, "packages/domain/src/sales/use-cases/create-order.ts");

  await writeFixtureFile(
    root,
    "packages/domain/src/sales/model/order.ts",
    "export function order() {}\n",
  );
  await writeFixtureFile(
    root,
    "packages/domain/src/sales/use-cases/create-order.ts",
    [
      'import { order } from "../model/order";',
      "export function createOrder() {",
      "  return order();",
      "}",
    ].join("\n"),
  );
  const controlReport = await cruiseFixture(root, ["packages"]);
  assert.equal(violationsFor(controlReport, "model-not-use-cases").length, 0);
});

test("model-not-use-cases flags model reaching use-cases through an index.ts, its own concept's or another's", async (t) => {
  const root = await makeFixture(t, {
    "packages/domain/src/sales/model/order.ts": [
      'import { createOrder } from "../index";',
      'import { refund } from "../../returns/index";',
      "export function order() {",
      "  return [createOrder, refund];",
      "}",
    ].join("\n"),
    "packages/domain/src/sales/index.ts":
      'export { createOrder } from "./use-cases/create-order";\n',
    "packages/domain/src/sales/use-cases/create-order.ts": "export function createOrder() {}\n",
    "packages/domain/src/returns/index.ts": 'export { refund } from "./use-cases/refund";\n',
    "packages/domain/src/returns/use-cases/refund.ts": "export function refund() {}\n",
  });

  const report = await cruiseFixture(root, ["packages"]);
  const reached = violationsFor(report, "model-not-use-cases").map((violation) => violation.to);

  assert.deepEqual(reached.sort(), [
    "packages/domain/src/returns/use-cases/refund.ts",
    "packages/domain/src/sales/use-cases/create-order.ts",
  ]);
});

test("concept-entry-point-only flags reaching into another concept's internals and allows its index.ts", async (t) => {
  const root = await makeFixture(t, {
    "packages/domain/src/sales/use-cases/create-order.ts": [
      'import { refundPolicy } from "../../returns/model/refund-policy";',
      "export function createOrder() {",
      "  return refundPolicy();",
      "}",
    ].join("\n"),
    "packages/domain/src/returns/model/refund-policy.ts": "export function refundPolicy() {}\n",
    "packages/domain/src/returns/index.ts":
      'export { refundPolicy } from "./model/refund-policy";\n',
  });

  const report = await cruiseFixture(root, ["packages"]);
  const violations = violationsFor(report, "concept-entry-point-only");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].to, "packages/domain/src/returns/model/refund-policy.ts");

  await writeFixtureFile(
    root,
    "packages/domain/src/sales/use-cases/create-order.ts",
    [
      'import { refundPolicy } from "../../returns/index";',
      "export function createOrder() {",
      "  return refundPolicy();",
      "}",
    ].join("\n"),
  );
  const controlReport = await cruiseFixture(root, ["packages"]);
  assert.equal(violationsFor(controlReport, "concept-entry-point-only").length, 0);
});

test("a use case reaching into its own concept's model breaks no rule", async (t) => {
  const root = await makeFixture(t, {
    "packages/domain/src/sales/use-cases/create-order.ts": [
      'import { order } from "../model/order";',
      "export function createOrder() {",
      "  return order();",
      "}",
    ].join("\n"),
    "packages/domain/src/sales/model/order.ts": "export function order() {}\n",
  });

  const report = await cruiseFixture(root, ["packages"]);

  assert.deepEqual(report.summary.violations, []);
});

test("concept-not-domain-root flags a concept importing a domain root helper or the domain root index.ts", async (t) => {
  const root = await makeFixture(t, {
    "packages/domain/src/sales/use-cases/create-order.ts": [
      'import { refundPolicy } from "../../bridge";',
      'import { refund } from "@purosur/domain";',
      "export function createOrder() {",
      "  return [refundPolicy, refund];",
      "}",
    ].join("\n"),
    "packages/domain/src/bridge.ts":
      'export { refundPolicy } from "./returns/model/refund-policy";\n',
    "packages/domain/src/index.ts": 'export { refund } from "./returns/index";\n',
    "packages/domain/src/returns/model/refund-policy.ts": "export function refundPolicy() {}\n",
    "packages/domain/src/returns/index.ts":
      'export { refundPolicy as refund } from "./model/refund-policy";\n',
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: { "@purosur/domain": ["./packages/domain/src/index.ts"] },
      },
    }),
  });

  const report = await cruiseFixture(root, ["packages"]);
  const violationTargets = violationsFor(report, "concept-not-domain-root").map(
    (violation) => violation.to,
  );

  assert.deepEqual(violationTargets.toSorted(), [
    "packages/domain/src/bridge.ts",
    "packages/domain/src/index.ts",
  ]);
});

test("no-use-case-to-use-case flags reaching another concept's use case through its index.ts and allows same-concept use", async (t) => {
  const root = await makeFixture(t, {
    "packages/domain/src/sales/use-cases/create-order.ts": [
      'import { refund } from "../../returns/index";',
      "export function createOrder() {",
      "  return refund();",
      "}",
    ].join("\n"),
    "packages/domain/src/returns/use-cases/refund.ts":
      'export function refund() {\n  return "refunded";\n}\n',
    "packages/domain/src/returns/index.ts": 'export { refund } from "./use-cases/refund";\n',
  });

  const report = await cruiseFixture(root, ["packages"]);
  const violations = violationsFor(report, "no-use-case-to-use-case");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].to, "packages/domain/src/returns/use-cases/refund.ts");

  // Closest allowed import: still crosses into returns/ through its entry
  // point, but that entry point only re-exports a model helper, so no
  // use-cases file is ever reached.
  await writeFixtureFile(
    root,
    "packages/domain/src/returns/index.ts",
    'export { refundPolicy } from "./model/refund-policy";\n',
  );
  await writeFixtureFile(
    root,
    "packages/domain/src/returns/model/refund-policy.ts",
    "export function refundPolicy() {}\n",
  );
  await writeFixtureFile(
    root,
    "packages/domain/src/sales/use-cases/create-order.ts",
    [
      'import { refundPolicy } from "../../returns/index";',
      "export function createOrder() {",
      "  return refundPolicy();",
      "}",
    ].join("\n"),
  );
  const controlReport = await cruiseFixture(root, ["packages"]);
  assert.equal(violationsFor(controlReport, "no-use-case-to-use-case").length, 0);
});

test("no-use-case-to-use-case allows a use case calling another use case of its own concept", async (t) => {
  const root = await makeFixture(t, {
    "packages/domain/src/sales/use-cases/create-order.ts": [
      'import { priceOrder } from "./price-order";',
      "export function createOrder() {",
      "  return priceOrder();",
      "}",
    ].join("\n"),
    "packages/domain/src/sales/use-cases/price-order.ts": "export function priceOrder() {}\n",
  });

  const report = await cruiseFixture(root, ["packages"]);

  assert.equal(violationsFor(report, "no-use-case-to-use-case").length, 0);
});

test("no-concept-cycles flags a cycle crossing concepts and allows one contained inside a single concept", async (t) => {
  const root = await makeFixture(t, {
    "packages/domain/src/sales/index.ts": [
      'import { helper } from "../returns/index";',
      "export function saleThing() {",
      "  return helper();",
      "}",
    ].join("\n"),
    "packages/domain/src/returns/index.ts": [
      'import { saleThing } from "../sales/index";',
      "export function helper() {",
      "  return typeof saleThing;",
      "}",
    ].join("\n"),
  });

  const report = await cruiseFixture(root, ["packages"]);
  const violations = violationsFor(report, "no-concept-cycles");

  assert.equal(violations.length > 0, true);
  assert.equal(
    violations.every((violation) => violation.cycle.length > 0),
    true,
  );

  await rm(join(root, "packages/domain/src/sales/index.ts"));
  await rm(join(root, "packages/domain/src/returns/index.ts"));
  await writeFixtureFile(
    root,
    "packages/domain/src/sales/model/b.ts",
    'import { c } from "./c";\nexport function b() {\n  return c();\n}\n',
  );
  await writeFixtureFile(
    root,
    "packages/domain/src/sales/model/c.ts",
    'import { b } from "./b";\nexport function c() {\n  return typeof b;\n}\n',
  );
  const controlReport = await cruiseFixture(root, ["packages"]);
  assert.equal(violationsFor(controlReport, "no-concept-cycles").length, 0);
});

test("renderer-types-only-from-domain flags a value import from domain and allows a type-only one", async (t) => {
  const root = await makeFixture(t, {
    "apps/pos/src/renderer/view.ts": [
      'import { Order } from "../../../../packages/domain/src/sales/index";',
      "export function show(order) {",
      "  return order;",
      "}",
      "void Order;",
    ].join("\n"),
    "packages/domain/src/sales/index.ts": "export const Order = { id: 1 };\n",
  });

  const report = await cruiseFixture(root, ["apps", "packages"]);
  const violations = violationsFor(report, "renderer-types-only-from-domain");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].to, "packages/domain/src/sales/index.ts");

  await writeFixtureFile(
    root,
    "packages/domain/src/sales/index.ts",
    "export type Order = { id: number };\n",
  );
  await writeFixtureFile(
    root,
    "apps/pos/src/renderer/view.ts",
    [
      'import type { Order } from "../../../../packages/domain/src/sales/index";',
      "export function show(order: Order) {",
      "  return order.id;",
      "}",
    ].join("\n"),
  );
  const controlReport = await cruiseFixture(root, ["apps", "packages"]);
  assert.equal(violationsFor(controlReport, "renderer-types-only-from-domain").length, 0);
});

const RENDERER_FORBIDDEN_PACKAGES = [
  "electron",
  "better-sqlite3",
  "drizzle-orm",
  "serialport",
  "@serialport/parser-readline",
];

function importEach(specifiers) {
  return [
    ...specifiers.map((specifier, index) => `import * as dep${index} from "${specifier}";`),
    `export const deps = [${specifiers.map((_, index) => `dep${index}`).join(", ")}];`,
  ].join("\n");
}

test("renderer-no-db-or-hardware flags db/hardware packages and core, and allows packages/ui and a local folder named like a package", async (t) => {
  const specifiers = [...RENDERER_FORBIDDEN_PACKAGES, "drizzle-orm/sqlite-core", "../core/index"];
  const root = await makeFixture(t, {
    "apps/pos/src/renderer/view.ts": importEach(specifiers),
    "apps/pos/src/core/index.ts": "export function startCore() {}\n",
  });

  const report = await cruiseFixture(root, ["apps"]);
  const violationTargets = violationsFor(report, "renderer-no-db-or-hardware").map(
    (violation) => violation.to,
  );

  assert.deepEqual(
    violationTargets.toSorted(),
    [
      ...RENDERER_FORBIDDEN_PACKAGES,
      "apps/pos/src/core/index.ts",
      "drizzle-orm/sqlite-core",
    ].toSorted(),
  );

  await writeFixtureFile(
    root,
    "apps/pos/src/renderer/view.ts",
    importEach(["../../../../packages/ui/src/index", "./electron/bridge"]),
  );
  await writeFixtureFile(root, "apps/pos/src/renderer/electron/bridge.ts", "export {};\n");
  await writeFixtureFile(root, "packages/ui/src/index.ts", "export const Button = {};\n");
  const controlReport = await cruiseFixture(root, ["apps", "packages"]);
  assert.equal(violationsFor(controlReport, "renderer-no-db-or-hardware").length, 0);
});

test("renderer-no-db-or-hardware flags installed forbidden packages by their resolved node_modules paths", async (t) => {
  const root = await makeFixture(t, {
    "apps/pos/src/renderer/view.ts": importEach(RENDERER_FORBIDDEN_PACKAGES),
  });
  for (const packageName of RENDERER_FORBIDDEN_PACKAGES) {
    await installPnpmPackage(root, packageName);
  }

  const report = await cruiseFixture(root, ["apps"]);
  const violationTargets = violationsFor(report, "renderer-no-db-or-hardware").map(
    (violation) => violation.to,
  );

  assert.equal(violationTargets.length, RENDERER_FORBIDDEN_PACKAGES.length);
  for (const packageName of RENDERER_FORBIDDEN_PACKAGES) {
    assert.equal(
      violationTargets.some((to) => to.endsWith(`node_modules/${packageName}/index.js`)),
      true,
      packageName,
    );
  }
});

test("renderer-no-node-builtins flags a Node builtin and allows importing packages/ui", async (t) => {
  const root = await makeFixture(t, {
    "apps/pos/src/renderer/view.ts": importEach(["node:fs"]),
  });

  const report = await cruiseFixture(root, ["apps"]);
  const violations = violationsFor(report, "renderer-no-node-builtins");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].to, "fs");

  await writeFixtureFile(
    root,
    "apps/pos/src/renderer/view.ts",
    importEach(["../../../../packages/ui/src/index"]),
  );
  await writeFixtureFile(root, "packages/ui/src/index.ts", "export const Button = {};\n");
  const controlReport = await cruiseFixture(root, ["apps", "packages"]);
  assert.equal(violationsFor(controlReport, "renderer-no-node-builtins").length, 0);
});

test("register-no-cloud-use-cases flags reaching each cloud-only concept's use case and allows reaching a register use case", async (t) => {
  const cloudOnlyConcepts = ["purchasing", "alerts", "catalog", "pricing"];
  const files = {
    "apps/pos/src/main/index.ts": importEach(
      cloudOnlyConcepts.map((concept) => `../../../../packages/domain/src/${concept}/index`),
    ),
  };
  for (const concept of cloudOnlyConcepts) {
    files[`packages/domain/src/${concept}/use-cases/run.ts`] = "export function run() {}\n";
    files[`packages/domain/src/${concept}/index.ts`] = 'export { run } from "./use-cases/run";\n';
  }
  const root = await makeFixture(t, files);

  const report = await cruiseFixture(root, ["apps", "packages"]);
  const violationTargets = violationsFor(report, "register-no-cloud-use-cases").map(
    (violation) => violation.to,
  );

  assert.deepEqual(
    violationTargets.toSorted(),
    cloudOnlyConcepts
      .map((concept) => `packages/domain/src/${concept}/use-cases/run.ts`)
      .toSorted(),
  );

  await writeFixtureFile(
    root,
    "apps/pos/src/main/index.ts",
    [
      'import { ring } from "../../../../packages/domain/src/sales/index";',
      "export function run() {",
      "  return ring();",
      "}",
    ].join("\n"),
  );
  await writeFixtureFile(
    root,
    "packages/domain/src/sales/use-cases/ring-sale.ts",
    "export function ring() {}\n",
  );
  await writeFixtureFile(
    root,
    "packages/domain/src/sales/index.ts",
    'export { ring } from "./use-cases/ring-sale";\n',
  );
  const controlReport = await cruiseFixture(root, ["apps", "packages"]);
  assert.equal(violationsFor(controlReport, "register-no-cloud-use-cases").length, 0);
});

test("every cloud-only concept register-no-cloud-use-cases names exists in packages/domain/src", async () => {
  const domainSource = fileURLToPath(new URL("../../packages/domain/src/", import.meta.url));

  assert.equal(CLOUD_ONLY_CONCEPTS.length > 0, true);
  for (const concept of CLOUD_ONLY_CONCEPTS) {
    const entry = await stat(join(domainSource, concept));
    assert.equal(entry.isDirectory(), true, concept);
  }
});

test("main-process-scope flags importing other packages and allows electron and Node builtins", async (t) => {
  const root = await makeFixture(t, {
    "apps/pos/src/main/index.ts": [
      'import { Button } from "../../../../packages/ui/src/index";',
      'import leftPad from "left-pad";',
      'import { ipc } from "../core/electron/ipc";',
      "export function run() {",
      "  return [Button, leftPad, ipc];",
      "}",
    ].join("\n"),
    "packages/ui/src/index.ts": "export const Button = {};\n",
    "apps/pos/src/core/electron/ipc.ts": "export const ipc = {};\n",
  });

  const report = await cruiseFixture(root, ["apps", "packages"]);
  const violations = violationsFor(report, "main-process-scope");
  const violationTargets = violations.map((violation) => violation.to);

  assert.equal(violations.length, 3);
  assert.equal(violationTargets.includes("packages/ui/src/index.ts"), true);
  assert.equal(violationTargets.includes("left-pad"), true);
  assert.equal(violationTargets.includes("apps/pos/src/core/electron/ipc.ts"), true);

  await writeFixtureFile(
    root,
    "apps/pos/src/main/index.ts",
    [
      'import { app } from "electron";',
      'import { readFileSync } from "node:fs";',
      'import { createWindow } from "./window";',
      "export function run() {",
      "  return [app, readFileSync, createWindow];",
      "}",
    ].join("\n"),
  );
  await writeFixtureFile(
    root,
    "apps/pos/src/main/window.ts",
    "export function createWindow() {}\n",
  );
  const controlReport = await cruiseFixture(root, ["apps", "packages"]);
  assert.equal(violationsFor(controlReport, "main-process-scope").length, 0);
});

test("main-process-scope allows an installed electron, electron-updater, and @sentry/electron by their resolved node_modules paths", async (t) => {
  const root = await makeFixture(t, {
    "apps/pos/src/main/index.ts": [
      'import { app } from "electron";',
      'import updater from "electron-updater";',
      'import * as Sentry from "@sentry/electron";',
      "export function run() {",
      "  return [app, updater, Sentry];",
      "}",
    ].join("\n"),
  });
  await installPnpmPackage(root, "electron");
  await installPnpmPackage(root, "electron-updater");
  await installPnpmPackage(root, "@sentry/electron");

  const report = await cruiseFixture(root, ["apps"]);

  assert.equal(violationsFor(report, "main-process-scope").length, 0);
});
