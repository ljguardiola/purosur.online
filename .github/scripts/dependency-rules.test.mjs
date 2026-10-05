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

// pnpm installs under node_modules/.pnpm/<name>@<version>/node_modules/<name>, with a symlink at
// node_modules/<name>; dependency-cruiser follows the symlink, so a rule sees the store path.
async function installPnpmPackage(root, packageName, main = "index.js") {
  const storeDirName = `${packageName.replace("/", "+")}@1.0.0`;
  const realDir = join(root, "node_modules/.pnpm", storeDirName, "node_modules", packageName);
  await mkdir(dirname(join(realDir, main)), { recursive: true });
  await writeFile(
    join(realDir, "package.json"),
    JSON.stringify({ name: packageName, version: "1.0.0", main }),
  );
  await writeFile(join(realDir, main), "module.exports = {};\n");

  const linkPath = join(root, "node_modules", packageName);
  await mkdir(dirname(linkPath), { recursive: true });
  await symlink(realDir, linkPath, "dir");
}

async function makeFixture(t, files) {
  const root = await mkdtemp(join(tmpdir(), "depcruise-fixture-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const withTsConfig = { [config.options.tsConfig.fileName]: "{}\n", ...files };
  for (const [relativePath, content] of Object.entries(withTsConfig)) {
    await writeFixtureFile(root, relativePath, content);
  }
  return root;
}

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

test("domain-not-contracts flags domain importing contracts and allows contracts importing domain through its package", async (t) => {
  const root = await makeFixture(t, {
    "packages/domain/src/sales/model/order.ts": [
      'import type { OrderContract } from "../../../../contracts/src/index";',
      "export type Order = OrderContract;",
    ].join("\n"),
    "packages/contracts/src/index.ts": "export type OrderContract = { id: string };\n",
    "packages/domain/package.json": JSON.stringify({
      name: "@purosur/domain",
      type: "module",
      exports: {
        ".": {
          "@purosur/source": "./src/index.ts",
          types: "./dist/index.d.ts",
          default: "./dist/index.js",
        },
      },
    }),
    "packages/domain/src/index.ts": "export type Id = string;\n",
  });
  await mkdir(join(root, "packages/contracts/node_modules/@purosur"), { recursive: true });
  await symlink("../../../domain", join(root, "packages/contracts/node_modules/@purosur/domain"));

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
    "packages/domain/src/sales/model/order.ts",
    [
      'import { refundPolicy } from "../../returns/index";',
      "export function order() {",
      "  return refundPolicy();",
      "}",
    ].join("\n"),
  );
  const controlReport = await cruiseFixture(root, ["packages"]);
  assert.equal(violationsFor(controlReport, "model-not-use-cases").length, 0);
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

test("screens-types-only-from-domain flags a value import from domain and allows a type-only one", async (t) => {
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
  const violations = violationsFor(report, "screens-types-only-from-domain");

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
  assert.equal(violationsFor(controlReport, "screens-types-only-from-domain").length, 0);
});

test("screens-no-domain-re-exports flags every re-export from domain, even an empty or type-only one, and allows a type import", async (t) => {
  const root = await makeFixture(t, {
    "apps/pos/src/renderer/empty.ts":
      'export {} from "../../../../packages/domain/src/sales/index";\n',
    "apps/pos/src/renderer/typed.ts":
      'export type { Order } from "../../../../packages/domain/src/sales/index";\n',
    "apps/pos/src/renderer/view.ts": [
      'import type { Order } from "../../../../packages/domain/src/sales/index";',
      "export function show(order: Order) {",
      "  return order.id;",
      "}",
    ].join("\n"),
    "packages/domain/src/sales/index.ts": "export type Order = { id: number };\n",
  });

  const report = await cruiseFixture(root, ["apps", "packages"]);
  const sources = violationsFor(report, "screens-no-domain-re-exports").map(
    (violation) => violation.from,
  );

  assert.deepEqual(sources.toSorted(), [
    "apps/pos/src/renderer/empty.ts",
    "apps/pos/src/renderer/typed.ts",
  ]);
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
  assert.deepEqual(CLOUD_ONLY_CONCEPTS, ["purchasing", "alerts", "catalog", "pricing"]);
  const cloudOnlyConcepts = CLOUD_ONLY_CONCEPTS;
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

test("main-process-scope flags importing other packages and allows electron, Node builtins and contracts' entry point", async (t) => {
  const root = await makeFixture(t, {
    "apps/pos/src/main/index.ts": [
      'import { Button } from "../../../../packages/ui/src/index";',
      'import { scrub } from "../../../../packages/contracts/src/shared/scrub";',
      'import leftPad from "left-pad";',
      'import { ipc } from "../core/electron/ipc";',
      "export function run() {",
      "  return [Button, scrub, leftPad, ipc];",
      "}",
    ].join("\n"),
    "packages/ui/src/index.ts": "export const Button = {};\n",
    "packages/contracts/src/shared/scrub.ts": "export function scrub() {}\n",
    "apps/pos/src/core/electron/ipc.ts": "export const ipc = {};\n",
  });

  const report = await cruiseFixture(root, ["apps", "packages"]);
  const violations = violationsFor(report, "main-process-scope");
  const violationTargets = violations.map((violation) => violation.to);

  assert.equal(violations.length, 4);
  assert.equal(violationTargets.includes("packages/ui/src/index.ts"), true);
  assert.equal(violationTargets.includes("packages/contracts/src/shared/scrub.ts"), true);
  assert.equal(violationTargets.includes("left-pad"), true);
  assert.equal(violationTargets.includes("apps/pos/src/core/electron/ipc.ts"), true);

  await writeFixtureFile(
    root,
    "apps/pos/src/main/index.ts",
    [
      'import { app } from "electron";',
      'import { readFileSync } from "node:fs";',
      'import { scrub } from "../../../../packages/contracts/src/index";',
      'import { createWindow } from "./window";',
      "export function run() {",
      "  return [app, readFileSync, scrub, createWindow];",
      "}",
    ].join("\n"),
  );
  await writeFixtureFile(
    root,
    "packages/contracts/src/index.ts",
    'export { scrub } from "./shared/scrub";\n',
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

test("real-postgres-tests-no-pglite flags a cloud integration test at any depth or the Postgres global setup reaching PGlite, even through a helper", async (t) => {
  const root = await makeFixture(t, {
    "apps/cloud/src/db/journal.integration.test.ts": [
      'import { readJournal } from "./journal-helpers";',
      "export const deps = [readJournal];",
    ].join("\n"),
    "apps/cloud/src/platform/db/snapshot.integration.test.ts": [
      'import { PGlite } from "@electric-sql/pglite";',
      "export const deps = [PGlite];",
    ].join("\n"),
    "apps/cloud/src/db/journal-helpers.ts": [
      'import { PGlite } from "@electric-sql/pglite";',
      'import { drizzle } from "drizzle-orm/pglite";',
      "export function readJournal() {",
      "  return [PGlite, drizzle];",
      "}",
    ].join("\n"),
    "apps/cloud/vitest.global-setup.postgres.ts": [
      'import { PGlite } from "@electric-sql/pglite";',
      "export default function setup() {",
      "  return PGlite;",
      "}",
    ].join("\n"),
  });
  await installPnpmPackage(root, "@electric-sql/pglite", "dist/index.js");
  await installPnpmPackage(root, "drizzle-orm", "pglite/index.js");

  const report = await cruiseFixture(root, ["apps"]);
  const violations = violationsFor(report, "real-postgres-tests-no-pglite");
  const violationPairs = violations.map((violation) => `${violation.from} -> ${violation.to}`);

  assert.equal(violations.length, 4);
  assert.equal(
    violationPairs.some(
      (pair) =>
        pair.startsWith("apps/cloud/src/db/journal.integration.test.ts -> ") &&
        pair.endsWith("node_modules/@electric-sql/pglite/dist/index.js"),
    ),
    true,
  );
  assert.equal(
    violationPairs.some(
      (pair) =>
        pair.startsWith("apps/cloud/src/platform/db/snapshot.integration.test.ts -> ") &&
        pair.endsWith("node_modules/@electric-sql/pglite/dist/index.js"),
    ),
    true,
  );
  assert.equal(
    violationPairs.some(
      (pair) =>
        pair.startsWith("apps/cloud/src/db/journal.integration.test.ts -> ") &&
        pair.endsWith("node_modules/drizzle-orm/pglite/index.js"),
    ),
    true,
  );
  assert.equal(
    violationPairs.some(
      (pair) =>
        pair.startsWith("apps/cloud/vitest.global-setup.postgres.ts -> ") &&
        pair.endsWith("node_modules/@electric-sql/pglite/dist/index.js"),
    ),
    true,
  );

  await writeFixtureFile(
    root,
    "apps/cloud/src/db/journal-helpers.ts",
    'import { readFile } from "node:fs/promises";\nexport const readJournal = readFile;\n',
  );
  await writeFixtureFile(
    root,
    "apps/cloud/vitest.global-setup.postgres.ts",
    "export default function setup() {}\n",
  );
  await writeFixtureFile(
    root,
    "apps/cloud/src/platform/db/snapshot.integration.test.ts",
    'import { readFile } from "node:fs/promises";\nexport const deps = [readFile];\n',
  );
  const controlReport = await cruiseFixture(root, ["apps"]);
  assert.equal(violationsFor(controlReport, "real-postgres-tests-no-pglite").length, 0);
});

test("a test the cloud's real-Postgres project doesn't run breaks no rule, even when named .integration.test", async (t) => {
  const root = await makeFixture(t, {
    "packages/domain/src/sales/model/order.integration.test.ts": [
      'import { readFileSync } from "node:fs";',
      "export const deps = [readFileSync];",
    ].join("\n"),
    "apps/cloud/src/db/journal.integration.test.tsx": [
      'import { PGlite } from "@electric-sql/pglite";',
      "export const deps = [PGlite];",
    ].join("\n"),
  });
  await installPnpmPackage(root, "@electric-sql/pglite", "dist/index.js");

  const report = await cruiseFixture(root, ["packages", "apps"]);

  assert.deepEqual(report.summary.violations, []);
});

test("a workspace package's build output under dist/ is not cruised", async (t) => {
  const root = await makeFixture(t, {
    "apps/pos/dist/index.js":
      'import { helper } from "../../cloud/src/helper.js";\nexport { helper };\n',
    "apps/cloud/src/helper.ts": "export function helper() {}\n",
  });

  const report = await cruiseFixture(root, ["apps"]);
  assert.equal(violationsFor(report, "no-app-to-app").length, 0);

  await writeFixtureFile(
    root,
    "apps/pos/src/index.ts",
    'import { helper } from "../../cloud/src/helper";\nexport { helper };\n',
  );
  const controlReport = await cruiseFixture(root, ["apps"]);
  assert.equal(violationsFor(controlReport, "no-app-to-app").length, 1);
});

test("the register's build output under out/ is not cruised", async (t) => {
  const root = await makeFixture(t, {
    "apps/pos/out/main/index.js":
      'import { helper } from "../../../cloud/src/helper.js";\nexport { helper };\n',
    "apps/cloud/src/helper.ts": "export function helper() {}\n",
  });

  const report = await cruiseFixture(root, ["apps"]);
  assert.equal(violationsFor(report, "no-app-to-app").length, 0);

  await writeFixtureFile(
    root,
    "apps/pos/src/index.ts",
    'import { helper } from "../../cloud/src/helper";\nexport { helper };\n',
  );
  const controlReport = await cruiseFixture(root, ["apps"]);
  assert.equal(violationsFor(controlReport, "no-app-to-app").length, 1);
});

test("cloud-server-never-migrates flags the cloud server reaching the migrate entry point or drizzle's migrator, even through a helper", async (t) => {
  const root = await makeFixture(t, {
    "apps/cloud/src/server.ts": [
      'import { boot } from "./platform/boot";',
      'import { migrate } from "drizzle-orm/postgres-js/migrator";',
      "export const deps = [boot, migrate];",
    ].join("\n"),
    "apps/cloud/src/platform/boot.ts": [
      'import { runMigrations } from "../migrate";',
      "export const boot = runMigrations;",
    ].join("\n"),
    "apps/cloud/src/migrate.ts": "export function runMigrations() {}\n",
  });
  await installPnpmPackage(root, "drizzle-orm", "postgres-js/migrator.js");

  const report = await cruiseFixture(root, ["apps"]);
  const violationPairs = violationsFor(report, "cloud-server-never-migrates").map(
    (violation) => `${violation.from} -> ${violation.to}`,
  );

  assert.equal(violationPairs.length, 2);
  assert.equal(
    violationPairs.some(
      (pair) =>
        pair.startsWith("apps/cloud/src/server.ts -> ") &&
        pair.endsWith("apps/cloud/src/migrate.ts"),
    ),
    true,
  );
  assert.equal(
    violationPairs.some(
      (pair) =>
        pair.startsWith("apps/cloud/src/server.ts -> ") &&
        pair.endsWith("node_modules/drizzle-orm/postgres-js/migrator.js"),
    ),
    true,
  );

  await writeFixtureFile(
    root,
    "apps/cloud/src/server.ts",
    'import { readFile } from "node:fs/promises";\nexport const deps = [readFile];\n',
  );
  const controlReport = await cruiseFixture(root, ["apps"]);
  assert.equal(violationsFor(controlReport, "cloud-server-never-migrates").length, 0);
});

test("screens-types-only-from-domain flags a backoffice value import from domain and allows a type-only one", async (t) => {
  const root = await makeFixture(t, {
    "apps/backoffice/src/catalog/screen.ts": [
      'import { Order } from "../../../../packages/domain/src/sales/index";',
      "export const screen = Order;",
    ].join("\n"),
    "packages/domain/src/sales/index.ts": "export const Order = { id: 1 };\n",
  });

  const report = await cruiseFixture(root, ["apps", "packages"]);
  const violations = violationsFor(report, "screens-types-only-from-domain");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].from, "apps/backoffice/src/catalog/screen.ts");

  await writeFixtureFile(
    root,
    "apps/backoffice/src/catalog/screen.ts",
    [
      'import type { Order } from "../../../../packages/domain/src/sales/index";',
      "export type Screen = Order;",
    ].join("\n"),
  );
  const controlReport = await cruiseFixture(root, ["apps", "packages"]);
  assert.equal(violationsFor(controlReport, "screens-types-only-from-domain").length, 0);
});

test("screens-no-domain-re-exports flags every backoffice re-export from domain and allows a type import", async (t) => {
  const root = await makeFixture(t, {
    "apps/backoffice/src/catalog/empty.ts":
      'export {} from "../../../../packages/domain/src/sales/index";\n',
    "apps/backoffice/src/catalog/typed.ts":
      'export type { Order } from "../../../../packages/domain/src/sales/index";\n',
    "apps/backoffice/src/catalog/view.ts": [
      'import type { Order } from "../../../../packages/domain/src/sales/index";',
      "export type View = Order;",
    ].join("\n"),
    "packages/domain/src/sales/index.ts": "export type Order = { id: number };\n",
  });

  const report = await cruiseFixture(root, ["apps", "packages"]);
  const sources = violationsFor(report, "screens-no-domain-re-exports").map(
    (violation) => violation.from,
  );

  assert.deepEqual(sources.toSorted(), [
    "apps/backoffice/src/catalog/empty.ts",
    "apps/backoffice/src/catalog/typed.ts",
  ]);
});

test("contracts-no-domain-value-re-exports flags named and star re-exports of domain and allows a type-only re-export and an import", async (t) => {
  const root = await makeFixture(t, {
    "packages/contracts/src/named.ts": 'export { Order } from "../../domain/src/sales/index";\n',
    "packages/contracts/src/star.ts": 'export * from "../../domain/src/sales/index";\n',
    "packages/contracts/src/typed.ts":
      'export type { Order } from "../../domain/src/sales/index";\n',
    "packages/contracts/src/shape.ts": [
      'import { Order } from "../../domain/src/sales/index";',
      "export const shape = Order;",
    ].join("\n"),
    "packages/domain/src/sales/index.ts": "export const Order = { id: 1 };\n",
  });

  const report = await cruiseFixture(root, ["packages"]);
  const sources = violationsFor(report, "contracts-no-domain-value-re-exports").map(
    (violation) => violation.from,
  );

  assert.deepEqual(sources.toSorted(), [
    "packages/contracts/src/named.ts",
    "packages/contracts/src/star.ts",
  ]);
});

const DATABASE_SPECIFIERS = ["drizzle-orm", "drizzle-orm/pg-core", "better-sqlite3"];

test("persistence-only-in-adapters flags a cloud route importing the database and allows an adapter and a route calling one", async (t) => {
  const root = await makeFixture(t, {
    "apps/cloud/src/catalog/list-route.ts": importEach([
      ...DATABASE_SPECIFIERS,
      "../platform/db/schema",
      "../platform/db/connection",
    ]),
    "apps/cloud/src/platform/db/schema.ts": "export const products = {};\n",
    "apps/cloud/src/platform/db/connection.ts": "export const connection = {};\n",
    "apps/cloud/src/catalog/drizzle-catalog-store.ts": importEach([
      "drizzle-orm",
      "../platform/db/schema",
    ]),
  });

  const report = await cruiseFixture(root, ["apps"]);
  const violations = violationsFor(report, "persistence-only-in-adapters");

  assert.deepEqual(
    new Set(violations.map((violation) => violation.from)),
    new Set(["apps/cloud/src/catalog/list-route.ts"]),
  );
  assert.deepEqual(
    violations.map((violation) => violation.to).toSorted(),
    [
      ...DATABASE_SPECIFIERS,
      "apps/cloud/src/platform/db/connection.ts",
      "apps/cloud/src/platform/db/schema.ts",
    ].toSorted(),
  );

  await writeFixtureFile(
    root,
    "apps/cloud/src/catalog/list-route.ts",
    importEach(["./drizzle-catalog-store"]),
  );
  const controlReport = await cruiseFixture(root, ["apps"]);
  assert.equal(violationsFor(controlReport, "persistence-only-in-adapters").length, 0);
});

test("persistence-only-in-adapters flags a register request handler importing the database and allows an adapter and a handler calling one", async (t) => {
  const root = await makeFixture(t, {
    "apps/pos/src/core/register/sale-requests.ts": importEach([
      ...DATABASE_SPECIFIERS,
      "../platform/local-database",
    ]),
    "apps/pos/src/core/platform/local-database.ts": "export const database = {};\n",
    "apps/pos/src/core/register/sqlite-sale-store.ts": importEach([
      "better-sqlite3",
      "../platform/local-database",
    ]),
  });

  const report = await cruiseFixture(root, ["apps"]);
  const violations = violationsFor(report, "persistence-only-in-adapters");

  assert.deepEqual(
    violations.map((violation) => violation.to).toSorted(),
    [...DATABASE_SPECIFIERS, "apps/pos/src/core/platform/local-database.ts"].toSorted(),
  );

  await writeFixtureFile(
    root,
    "apps/pos/src/core/register/sale-requests.ts",
    importEach(["./sqlite-sale-store"]),
  );
  const controlReport = await cruiseFixture(root, ["apps"]);
  assert.equal(violationsFor(controlReport, "persistence-only-in-adapters").length, 0);
});

test("screens-no-cross-concept-imports flags a backoffice concept importing another concept and allows its own folder, shell, platform and help", async (t) => {
  const root = await makeFixture(t, {
    "apps/backoffice/src/catalog/products-screen.tsx": importEach([
      "../pricing/money",
      "../pricing/prices/price-form",
      "./brand-name",
      "./forms/product-form",
      "../shell/layout",
      "../platform/http",
      "../help/manual",
    ]),
    "apps/backoffice/src/pricing/money.ts": "export const money = {};\n",
    "apps/backoffice/src/pricing/prices/price-form.ts": "export const priceForm = {};\n",
    "apps/backoffice/src/catalog/brand-name.ts": "export const brandName = {};\n",
    "apps/backoffice/src/catalog/forms/product-form.ts": "export const productForm = {};\n",
    "apps/backoffice/src/shell/layout.ts": importEach(["../catalog/brand-name"]),
    "apps/backoffice/src/platform/http.ts": importEach(["../pricing/money"]),
    "apps/backoffice/src/help/manual.ts": importEach(["../stock/count-moment"]),
    "apps/backoffice/src/stock/count-moment.ts": "export const countMoment = {};\n",
    "apps/backoffice/src/main.tsx": importEach(["./catalog/brand-name", "./pricing/money"]),
  });

  const report = await cruiseFixture(root, ["apps"]);
  const violations = violationsFor(report, "screens-no-cross-concept-imports");

  assert.deepEqual(violations.map((violation) => [violation.from, violation.to]).toSorted(), [
    ["apps/backoffice/src/catalog/products-screen.tsx", "apps/backoffice/src/pricing/money.ts"],
    [
      "apps/backoffice/src/catalog/products-screen.tsx",
      "apps/backoffice/src/pricing/prices/price-form.ts",
    ],
  ]);

  await writeFixtureFile(
    root,
    "apps/backoffice/src/catalog/products-screen.tsx",
    importEach(["./brand-name", "../platform/http"]),
  );
  const controlReport = await cruiseFixture(root, ["apps"]);
  assert.equal(violationsFor(controlReport, "screens-no-cross-concept-imports").length, 0);
});

test("screens-no-cross-concept-imports flags a register renderer concept importing another concept and allows its own folder, shell and platform", async (t) => {
  const root = await makeFixture(t, {
    "apps/pos/src/renderer/sales/checkout-screen.tsx": importEach([
      "../register/session",
      "./cart",
      "../shell/layout",
      "../platform/core-client",
    ]),
    "apps/pos/src/renderer/register/session.ts": "export const session = {};\n",
    "apps/pos/src/renderer/sales/cart.ts": "export const cart = {};\n",
    "apps/pos/src/renderer/shell/layout.ts": importEach(["../sales/cart"]),
    "apps/pos/src/renderer/platform/core-client.ts": importEach(["../register/session"]),
    "apps/pos/src/renderer/main.tsx": importEach(["./sales/cart", "./register/session"]),
    "apps/pos/src/core/sales/sale-requests.ts": importEach(["../register/session"]),
    "apps/pos/src/core/register/session.ts": "export const session = {};\n",
  });

  const report = await cruiseFixture(root, ["apps"]);
  const violations = violationsFor(report, "screens-no-cross-concept-imports");

  assert.deepEqual(
    violations.map((violation) => [violation.from, violation.to]),
    [
      [
        "apps/pos/src/renderer/sales/checkout-screen.tsx",
        "apps/pos/src/renderer/register/session.ts",
      ],
    ],
  );
});

test("contracts-no-cross-concept-imports flags a concept importing another concept and allows its own folder and shared", async (t) => {
  const root = await makeFixture(t, {
    "packages/contracts/src/catalog/product.ts": importEach([
      "../pricing/price",
      "../pricing/prices/price-line",
      "./brand",
      "./brands/brand-line",
      "../shared/index",
    ]),
    "packages/contracts/src/pricing/price.ts": "export const price = {};\n",
    "packages/contracts/src/pricing/prices/price-line.ts": "export const priceLine = {};\n",
    "packages/contracts/src/catalog/brand.ts": "export const brand = {};\n",
    "packages/contracts/src/catalog/brands/brand-line.ts": "export const brandLine = {};\n",
    "packages/contracts/src/shared/index.ts": importEach(["../catalog/brand"]),
    "packages/contracts/src/index.ts": importEach(["./catalog/product", "./pricing/price"]),
  });

  const report = await cruiseFixture(root, ["packages"]);
  const violations = violationsFor(report, "contracts-no-cross-concept-imports");

  assert.deepEqual(violations.map((violation) => [violation.from, violation.to]).toSorted(), [
    ["packages/contracts/src/catalog/product.ts", "packages/contracts/src/pricing/price.ts"],
    [
      "packages/contracts/src/catalog/product.ts",
      "packages/contracts/src/pricing/prices/price-line.ts",
    ],
  ]);

  await writeFixtureFile(
    root,
    "packages/contracts/src/catalog/product.ts",
    importEach(["./brand", "../shared/index"]),
  );
  const controlReport = await cruiseFixture(root, ["packages"]);
  assert.equal(violationsFor(controlReport, "contracts-no-cross-concept-imports").length, 0);
});

test("contracts-concept-not-root flags a concept or shared importing a contracts root file and allows the root importing a concept", async (t) => {
  const root = await makeFixture(t, {
    "packages/contracts/src/sales/sale.ts": importEach(["../index", "../bridge", "./line"]),
    "packages/contracts/src/sales/line.ts": "export const line = {};\n",
    "packages/contracts/src/shared/index.ts": importEach(["../index"]),
    "packages/contracts/src/bridge.ts": importEach(["./pricing/price-list"]),
    "packages/contracts/src/pricing/price-list.ts": "export const priceList = {};\n",
    "packages/contracts/src/index.ts": importEach(["./pricing/price-list"]),
  });

  const report = await cruiseFixture(root, ["packages"]);
  const violations = violationsFor(report, "contracts-concept-not-root");

  assert.deepEqual(violations.map((violation) => [violation.from, violation.to]).toSorted(), [
    ["packages/contracts/src/sales/sale.ts", "packages/contracts/src/bridge.ts"],
    ["packages/contracts/src/sales/sale.ts", "packages/contracts/src/index.ts"],
    ["packages/contracts/src/shared/index.ts", "packages/contracts/src/index.ts"],
  ]);
});

test("persistence-only-in-adapters allows type-only database imports and flags value imports", async (t) => {
  const root = await makeFixture(t, {
    "apps/cloud/src/catalog/typed-route.ts": [
      'import type { SQL } from "drizzle-orm";',
      'import type { products } from "../platform/db/schema";',
      "export type Wiring = [SQL, typeof products];",
    ].join("\n"),
    "apps/cloud/src/catalog/valued-route.ts": [
      'import { eq } from "drizzle-orm";',
      'import { products } from "../platform/db/schema";',
      "export const query = [eq, products];",
    ].join("\n"),
    "apps/cloud/src/platform/db/schema.ts": "export const products = {};\n",
    "apps/pos/src/core/sales/typed-requests.ts": [
      'import type { LocalDatabase } from "../platform/local-database";',
      "export type Wiring = LocalDatabase;",
    ].join("\n"),
    "apps/pos/src/core/sales/valued-requests.ts": [
      'import { openLocalDatabase } from "../platform/local-database";',
      "export const open = openLocalDatabase;",
    ].join("\n"),
    "apps/pos/src/core/platform/local-database.ts": [
      "export type LocalDatabase = object;",
      "export function openLocalDatabase() {}",
    ].join("\n"),
  });
  await installPnpmPackage(root, "drizzle-orm");

  const report = await cruiseFixture(root, ["apps"]);
  const sources = violationsFor(report, "persistence-only-in-adapters").map(
    (violation) => violation.from,
  );

  assert.deepEqual(
    new Set(sources),
    new Set([
      "apps/cloud/src/catalog/valued-route.ts",
      "apps/pos/src/core/sales/valued-requests.ts",
    ]),
  );
});

test("persistence-only-in-adapters flags a cloud route importing a Postgres driver", async (t) => {
  const drivers = ["postgres", "pg", "@electric-sql/pglite"];
  const root = await makeFixture(t, {
    "apps/cloud/src/catalog/driver-route.ts": importEach(drivers),
  });

  const report = await cruiseFixture(root, ["apps"]);
  const targets = violationsFor(report, "persistence-only-in-adapters").map(
    (violation) => violation.to,
  );

  assert.deepEqual(targets.toSorted(), drivers.toSorted());
});
