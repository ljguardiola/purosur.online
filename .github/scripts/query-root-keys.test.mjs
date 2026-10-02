import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { findQueryRootKeyProblems, QUERY_KEY_SOURCES } from "./query-root-keys.mjs";

const repoRoot = join(dirname(new URL(import.meta.url).pathname), "../..");

const TANSTACK = {
  "node_modules/@tanstack/query-core/package.json":
    '{ "name": "@tanstack/query-core", "types": "index.d.ts" }',
  "node_modules/@tanstack/query-core/index.d.ts": [
    "export type QueryKey = ReadonlyArray<unknown>;",
    "export interface QueryFilters<TQueryKey extends QueryKey = QueryKey> { queryKey?: TQueryKey; exact?: boolean }",
    "export interface QueryOptions<TQueryKey extends QueryKey = QueryKey> { queryKey: TQueryKey; queryFn: () => unknown }",
    "export declare class QueryClient {",
    "  setQueryData<TTaggedQueryKey extends QueryKey>(queryKey: TTaggedQueryKey, data: unknown): void;",
    "  invalidateQueries<TTaggedQueryKey extends QueryKey>(filters?: QueryFilters<TTaggedQueryKey>): void;",
    "}",
    "export declare function useQuery<TQueryKey extends QueryKey>(options: QueryOptions<TQueryKey>): unknown;",
  ].join("\n"),
  "node_modules/@tanstack/react-query/package.json":
    '{ "name": "@tanstack/react-query", "types": "index.d.ts" }',
  "node_modules/@tanstack/react-query/index.d.ts": 'export * from "@tanstack/query-core";',
};

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    noEmit: true,
    jsx: "preserve",
  },
  include: ["src"],
});

function problemsIn(t, files, foldersOutsideConcepts = []) {
  const root = mkdtempSync(join(tmpdir(), "query-root-keys-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, source] of Object.entries({
    ...TANSTACK,
    "tsconfig.json": TSCONFIG,
    ...files,
  })) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), source);
  }
  return findQueryRootKeyProblems(
    { tsconfig: "tsconfig.json", sourceRoot: "src", foldersOutsideConcepts },
    root,
  );
}

const IMPORTS = 'import { QueryClient, useQuery, type QueryKey } from "@tanstack/react-query";';

test("accepts a query key rooted at the concept folder holding it", (t) => {
  const problems = problemsIn(t, {
    "src/pricing/pricing-queries.ts": [
      IMPORTS,
      'export const pricingKey = ["pricing"] as const;',
      "export const pricingKeys = {",
      '  list: (search: string) => [...pricingKey, "list", search] as const,',
      "};",
      "export const usePrices = (search: string) =>",
      "  useQuery({ queryKey: pricingKeys.list(search), queryFn: () => [] });",
    ].join("\n"),
  });

  assert.deepEqual(problems, []);
});

test("refuses a root that is not the concept folder holding it, naming the file and line", (t) => {
  const problems = problemsIn(t, {
    "src/pricing/pricing-queries.ts": [
      IMPORTS,
      "",
      'export const pricesKey = ["prices"] as const;',
      'export const usePrices = () => useQuery({ queryKey: [...pricesKey, "list"], queryFn: () => [] });',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/pricing/pricing-queries.ts:3 roots a query key at "prices", but the concept folder holding it is "pricing"',
  ]);
});

test("refuses a root written inline in the query's options", (t) => {
  const problems = problemsIn(t, {
    "src/stock/stock-screen.ts": [
      IMPORTS,
      'export const useBalances = () => useQuery({ queryKey: ["balances"], queryFn: () => [] });',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/stock/stock-screen.ts:2 roots a query key at "balances", but the concept folder holding it is "stock"',
  ]);
});

test("names the file that builds a mismatched key used from another folder", (t) => {
  const problems = problemsIn(t, {
    "src/register/register-queries.ts": [
      'const registerKey = ["register"] as const;',
      'export const authorizersKey = ["authorizers"] as const;',
      "export const registerKeys = {",
      '  cash: [...registerKey, "cash"] as const,',
      "};",
    ].join("\n"),
    "src/shell/app.ts": [
      IMPORTS,
      'import { authorizersKey, registerKeys } from "../register/register-queries";',
      "export function refresh(client: QueryClient) {",
      "  client.invalidateQueries({ queryKey: registerKeys.cash });",
      "  client.invalidateQueries({ queryKey: authorizersKey });",
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/register/register-queries.ts:2 roots a query key at "authorizers", but the concept folder holding it is "register"',
  ]);
});

test("follows a key through a key function with a block body and a local constant", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      IMPORTS,
      "export const salesKeys = {",
      "  search(query: string) {",
      '    return ["search", query] as const;',
      "  },",
      "};",
      "export function useSearch(query: string) {",
      "  const queryKey = salesKeys.search(query);",
      "  return useQuery({ queryKey, queryFn: () => [] });",
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-queries.ts:4 roots a query key at "search", but the concept folder holding it is "sales"',
  ]);
});

test("checks a key passed as an argument the query client or a helper reads as a query key", (t) => {
  const problems = problemsIn(t, {
    "src/platform/set-query-answer.ts": [
      IMPORTS,
      "export function setQueryAnswer(client: QueryClient, queryKey: QueryKey, answer: unknown) {",
      "  client.setQueryData(queryKey, answer);",
      "}",
    ].join("\n"),
    "src/sales/sales-queries.ts": [
      IMPORTS,
      'import { setQueryAnswer } from "../platform/set-query-answer";',
      "export function answer(client: QueryClient) {",
      '  client.setQueryData(["sale"], 1);',
      '  setQueryAnswer(client, ["ticket"], 1);',
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-queries.ts:4 roots a query key at "sale", but the concept folder holding it is "sales"',
    'src/sales/sales-queries.ts:5 roots a query key at "ticket", but the concept folder holding it is "sales"',
  ]);
});

test("checks a key handed to a helper through a property typed as a query key, whatever its name", (t) => {
  const problems = problemsIn(t, {
    "src/platform/use-cloud-query.ts": [
      IMPORTS,
      "export function useCloudQuery({ key }: { key: QueryKey }) {",
      "  return useQuery({ queryKey: key, queryFn: () => [] });",
      "}",
    ].join("\n"),
    "src/alerts/alerts-queries.ts": [
      'import { useCloudQuery } from "../platform/use-cloud-query";',
      'export const useOverview = () => useCloudQuery({ key: ["overview"] });',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/alerts/alerts-queries.ts:2 roots a query key at "overview", but the concept folder holding it is "alerts"',
  ]);
});

test("checks a key given as the default value of a parameter or a destructured property typed as a query key", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      IMPORTS,
      'export function useTicket(key: QueryKey = ["ticket"]) {',
      "  return useQuery({ queryKey: key, queryFn: () => [] });",
      "}",
      'export function useReceipt({ key = ["receipt"] }: { key?: QueryKey }) {',
      "  return useQuery({ queryKey: key, queryFn: () => [] });",
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-queries.ts:2 roots a query key at "ticket", but the concept folder holding it is "sales"',
    'src/sales/sales-queries.ts:5 roots a query key at "receipt", but the concept folder holding it is "sales"',
  ]);
});

test("checks a key handed to a component through a prop typed as a query key, and refuses the prop the component reads", (t) => {
  const problems = problemsIn(t, {
    "src/sales/ticket-panel.tsx": [
      IMPORTS,
      "export function TicketPanel({ source }: { source: QueryKey }) {",
      "  useQuery({ queryKey: source, queryFn: () => [] });",
      "  return null;",
      "}",
      'export const ticketPanel = <TicketPanel source={["ticket"]} />;',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/ticket-panel.tsx:3 uses a query key whose root the check cannot read",
    'src/sales/ticket-panel.tsx:6 roots a query key at "ticket", but the concept folder holding it is "sales"',
  ]);
});

test("refuses a query key read from a component's prop given as its children", (t) => {
  const problems = problemsIn(t, {
    "src/sales/ticket-panel.tsx": [
      IMPORTS,
      "export function TicketPanel({ children }: { children: QueryKey }) {",
      "  useQuery({ queryKey: children, queryFn: () => [] });",
      "  return null;",
      "}",
      'export const ticketPanel = <TicketPanel>{["ticket"]}</TicketPanel>;',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/ticket-panel.tsx:3 uses a query key whose root the check cannot read",
  ]);
});

test("refuses a query key read from the parameter of a function whose callers the check cannot see", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-refresh.ts": [
      IMPORTS,
      "const client = new QueryClient();",
      "function invalidate(key: QueryKey) {",
      "  client.invalidateQueries({ queryKey: key });",
      "}",
      "const invalidateNow = (key: QueryKey) => client.invalidateQueries({ queryKey: key });",
      "export function refreshAll() {",
      '  [["sale"]].forEach((key: QueryKey) => client.invalidateQueries({ queryKey: key }));',
      '  [["ticket"]].forEach(invalidate);',
      '  invalidateNow(["receipt"]);',
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/sales-refresh.ts:4 uses a query key whose root the check cannot read",
    "src/sales/sales-refresh.ts:8 uses a query key whose root the check cannot read",
    'src/sales/sales-refresh.ts:10 roots a query key at "receipt", but the concept folder holding it is "sales"',
  ]);
});

const INVALIDATE = [
  IMPORTS,
  "const client = new QueryClient();",
  "export function invalidate(key: QueryKey) {",
  "  client.invalidateQueries({ queryKey: key });",
  "}",
].join("\n");

const SALES_KEYS = [
  IMPORTS,
  "const client = new QueryClient();",
  "export const salesKeys = {",
  "  invalidate(key: QueryKey) {",
  "    client.invalidateQueries({ queryKey: key });",
  "  },",
  "};",
].join("\n");

const UNCALLED_UNDER_ANOTHER_NAME = [
  {
    reach: "a renamed import",
    line: 4,
    files: {
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/refresh.ts": [
        'import { invalidate as refresh } from "./invalidate";',
        'export const refreshAll = () => [["ticket"]].forEach(refresh);',
      ].join("\n"),
    },
  },
  {
    reach: "a default import under another name",
    line: 4,
    files: {
      "src/sales/invalidate.ts": INVALIDATE.replace("export function", "export default function"),
      "src/sales/refresh.ts": [
        'import refresh from "./invalidate";',
        'export const refreshAll = () => [["ticket"]].forEach(refresh);',
      ].join("\n"),
    },
  },
  {
    reach: "a renamed re-export",
    line: 4,
    files: {
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/index.ts": 'export { invalidate as refresh } from "./invalidate";',
      "src/sales/refresh.ts": [
        'import { refresh } from "./index";',
        'export const refreshAll = () => [["ticket"]].forEach(refresh);',
      ].join("\n"),
    },
  },
  {
    reach: "an instantiation expression",
    line: 4,
    files: {
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/refresh.ts": [
        'import { invalidate } from "./invalidate";',
        'export const refreshAll = () => [["ticket"]].forEach(invalidate<never>);',
      ].join("\n"),
    },
  },
  {
    reach: "a destructured property",
    line: 5,
    files: {
      "src/sales/invalidate.ts": SALES_KEYS,
      "src/sales/refresh.ts": [
        'import { salesKeys } from "./invalidate";',
        "const { invalidate } = salesKeys;",
        'export const refreshAll = () => [["ticket"]].forEach(invalidate);',
      ].join("\n"),
    },
  },
  {
    reach: "a destructuring assignment",
    line: 5,
    files: {
      "src/sales/invalidate.ts": SALES_KEYS,
      "src/sales/refresh.ts": [
        'import { salesKeys } from "./invalidate";',
        "let refresh: typeof salesKeys.invalidate;",
        "({ invalidate: refresh } = salesKeys);",
        'export const refreshAll = () => [["ticket"]].forEach(refresh);',
      ].join("\n"),
    },
  },
  {
    reach: "a destructuring assignment nested in an object pattern",
    line: 5,
    files: {
      "src/sales/invalidate.ts": SALES_KEYS,
      "src/sales/refresh.ts": [
        'import { salesKeys } from "./invalidate";',
        "let refresh: typeof salesKeys.invalidate;",
        "({ keys: { invalidate: refresh } } = { keys: salesKeys });",
        'export const refreshAll = () => [["ticket"]].forEach(refresh);',
      ].join("\n"),
    },
  },
  {
    reach: "a destructuring assignment nested in an array pattern's rest element",
    line: 5,
    files: {
      "src/sales/invalidate.ts": SALES_KEYS,
      "src/sales/refresh.ts": [
        'import { salesKeys } from "./invalidate";',
        "let refresh: typeof salesKeys.invalidate;",
        "[...[{ invalidate: refresh }]] = [salesKeys];",
        'export const refreshAll = () => [["ticket"]].forEach(refresh);',
      ].join("\n"),
    },
  },
  {
    reach: "a destructuring assignment nested in an object pattern with a default",
    line: 5,
    files: {
      "src/sales/invalidate.ts": SALES_KEYS,
      "src/sales/refresh.ts": [
        'import { salesKeys } from "./invalidate";',
        "let refresh: typeof salesKeys.invalidate;",
        "({ keys: { invalidate: refresh } = { invalidate: () => {} } } = { keys: salesKeys });",
        'export const refreshAll = () => [["ticket"]].forEach(refresh);',
      ].join("\n"),
    },
  },
  {
    reach: "a destructuring assignment nested in an array pattern with a default",
    line: 5,
    files: {
      "src/sales/invalidate.ts": SALES_KEYS,
      "src/sales/refresh.ts": [
        'import { salesKeys } from "./invalidate";',
        "let refresh: typeof salesKeys.invalidate;",
        "[{ invalidate: refresh } = { invalidate: () => {} }] = [salesKeys];",
        'export const refreshAll = () => [["ticket"]].forEach(refresh);',
      ].join("\n"),
    },
  },
  {
    reach: "its own name inside a named function expression",
    line: 4,
    files: {
      "src/sales/invalidate.ts": [
        IMPORTS,
        "const client = new QueryClient();",
        "export const invalidate = function self(key: QueryKey) {",
        "  client.invalidateQueries({ queryKey: key });",
        '  if (key.length === 0) [["ticket"]].forEach(self);',
        "};",
      ].join("\n"),
    },
  },
  {
    reach: "the target of a for-of loop",
    line: 5,
    files: {
      "src/sales/invalidate.ts": SALES_KEYS,
      "src/sales/refresh.ts": [
        'import { salesKeys } from "./invalidate";',
        "let refresh: typeof salesKeys.invalidate;",
        "for ({ invalidate: refresh } of [salesKeys]);",
        'export const refreshAll = () => [["ticket"]].forEach(refresh);',
      ].join("\n"),
    },
  },
  {
    reach: "a property access passed as a value",
    line: 5,
    files: {
      "src/sales/invalidate.ts": SALES_KEYS,
      "src/sales/refresh.ts": [
        'import { salesKeys } from "./invalidate";',
        'export const refreshAll = () => [["ticket"]].forEach(salesKeys.invalidate);',
      ].join("\n"),
    },
  },
];

for (const { reach, line, files } of UNCALLED_UNDER_ANOTHER_NAME) {
  test(`refuses a query key read from the parameter of a function handed on uncalled through ${reach}`, (t) => {
    assert.deepEqual(problemsIn(t, files), [
      `src/sales/invalidate.ts:${line} uses a query key whose root the check cannot read`,
    ]);
  });
}

const BUNDLER_GLOBALS = [
  "interface ImportMeta {",
  "  glob(patterns: string | string[], options?: object): Record<string, unknown>;",
  "}",
].join("\n");

const EACH_EXPORT =
  'export const refreshAll = (keys: object) =>\n  (Object.values(keys) as ((key: unknown) => void)[]).forEach((each) => each(["ticket"]));';

const REACHED_THROUGH_ITS_MODULE_OBJECT = [
  {
    reach: "a namespace import",
    files: {
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/refresh.ts": [
        'import * as keys from "./invalidate";',
        EACH_EXPORT,
        "refreshAll(keys);",
      ].join("\n"),
    },
  },
  {
    reach: "an export of every name",
    files: {
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/index.ts": 'export * from "./invalidate";',
      "src/sales/refresh.ts": [
        'import * as keys from "./index";',
        EACH_EXPORT,
        "refreshAll(keys);",
      ].join("\n"),
    },
  },
  {
    reach: "an export of the module as a namespace",
    files: {
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/index.ts": 'export * as keys from "./invalidate";',
      "src/sales/refresh.ts": [
        'import { keys } from "./index";',
        EACH_EXPORT,
        "refreshAll(keys);",
      ].join("\n"),
    },
  },
  {
    reach: "an import assignment",
    files: {
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/refresh.ts": [
        'import keys = require("./invalidate");',
        EACH_EXPORT,
        "refreshAll(keys);",
      ].join("\n"),
    },
  },
  {
    reach: "a dynamic import",
    files: {
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/refresh.ts": [
        EACH_EXPORT,
        'export const refreshLater = async () => refreshAll(await import("./invalidate"));',
      ].join("\n"),
    },
  },
  {
    reach: "a barrel's re-export by name",
    files: {
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/index.ts": 'export { invalidate } from "./invalidate";',
      "src/sales/refresh.ts": [
        'import * as keys from "./index";',
        EACH_EXPORT,
        "refreshAll(keys);",
      ].join("\n"),
    },
  },
  {
    reach: "a barrel's export of a name it imports",
    files: {
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/index.ts": 'import { invalidate } from "./invalidate";\nexport { invalidate };',
      "src/sales/refresh.ts": [
        'import * as keys from "./index";',
        EACH_EXPORT,
        "refreshAll(keys);",
      ].join("\n"),
    },
  },
  {
    reach: "a glob import naming its file",
    files: {
      "src/env.d.ts": BUNDLER_GLOBALS,
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/refresh.ts": [
        EACH_EXPORT,
        'refreshAll(import.meta.glob("./invalidate.ts", { eager: true }));',
      ].join("\n"),
    },
  },
  {
    reach: "a glob import of a pattern matching its file",
    files: {
      "src/env.d.ts": BUNDLER_GLOBALS,
      "src/sales/invalidate.ts": INVALIDATE,
      "src/shell/refresh.ts": [
        EACH_EXPORT,
        'refreshAll(import.meta.glob(["../sales/*.ts", "./missing.ts"], { eager: true }));',
      ].join("\n"),
    },
  },
  {
    reach: "a glob import of a pattern the check cannot read",
    files: {
      "src/env.d.ts": BUNDLER_GLOBALS,
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/refresh.ts": [
        EACH_EXPORT,
        "export const refreshFrom = (pattern: string) => refreshAll(import.meta.glob(pattern, { eager: true }));",
      ].join("\n"),
    },
  },
  {
    reach: "import.meta held in another name",
    files: {
      "src/env.d.ts": BUNDLER_GLOBALS,
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/refresh.ts": [
        EACH_EXPORT,
        'const meta = import.meta;\nrefreshAll(meta.glob("./inval*.ts", { eager: true }));',
      ].join("\n"),
    },
  },
  {
    reach: "a parenthesized glob import",
    files: {
      "src/env.d.ts": BUNDLER_GLOBALS,
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/refresh.ts": [
        EACH_EXPORT,
        'refreshAll((import.meta.glob)("./inval*.ts", { eager: true }));',
      ].join("\n"),
    },
  },
  {
    reach: "a glob import read through a string-literal access",
    files: {
      "src/env.d.ts": BUNDLER_GLOBALS,
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/refresh.ts": [
        EACH_EXPORT,
        'refreshAll(import.meta["glob"]("./inval*.ts", { eager: true }));',
      ].join("\n"),
    },
  },
  {
    reach: "a glob import from another base folder",
    files: {
      "src/env.d.ts": BUNDLER_GLOBALS,
      "src/sales/invalidate.ts": INVALIDATE,
      "src/shell/refresh.ts": [
        EACH_EXPORT,
        'refreshAll(import.meta.glob("./*.ts", { base: "../sales", eager: true }));',
      ].join("\n"),
    },
  },
  {
    reach: "a glob import matching names in any case",
    files: {
      "src/env.d.ts": BUNDLER_GLOBALS,
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/refresh.ts": [
        EACH_EXPORT,
        'refreshAll(import.meta.glob("./INVALIDATE.ts", { caseSensitive: false, eager: true }));',
      ].join("\n"),
    },
  },
  {
    reach: "a glob import of options spread from another object",
    files: {
      "src/env.d.ts": BUNDLER_GLOBALS,
      "src/sales/invalidate.ts": INVALIDATE,
      "src/shell/refresh.ts": [
        EACH_EXPORT,
        "const options = { eager: true };",
        'refreshAll(import.meta.glob("./missing.ts", { ...options }));',
      ].join("\n"),
    },
  },
  {
    reach: "a glob import of options held in a variable",
    files: {
      "src/env.d.ts": BUNDLER_GLOBALS,
      "src/sales/invalidate.ts": INVALIDATE,
      "src/shell/refresh.ts": [
        EACH_EXPORT,
        "const options = { eager: true };",
        'refreshAll(import.meta.glob("./missing.ts", options));',
      ].join("\n"),
    },
  },
  {
    reach: "a glob import handed uncalled to another call",
    files: {
      "src/env.d.ts": BUNDLER_GLOBALS,
      "src/sales/invalidate.ts": INVALIDATE,
      "src/shell/refresh.ts": [
        EACH_EXPORT,
        "declare function take(...args: unknown[]): Record<string, unknown>;",
        'refreshAll(take("./missing.ts", { eager: true }, import.meta.glob));',
      ].join("\n"),
    },
  },
  {
    reach: "a glob import of an option the check cannot read",
    files: {
      "src/env.d.ts": BUNDLER_GLOBALS,
      "src/sales/invalidate.ts": INVALIDATE,
      "src/shell/refresh.ts": [
        EACH_EXPORT,
        'export const refreshFrom = (query: string) => refreshAll(import.meta.glob("./missing.ts", { query }));',
      ].join("\n"),
    },
  },
  {
    reach: "a glob import of an option value the check cannot read",
    files: {
      "src/env.d.ts": BUNDLER_GLOBALS,
      "src/sales/invalidate.ts": INVALIDATE,
      "src/shell/refresh.ts": [
        EACH_EXPORT,
        'export const refreshFrom = (eager: boolean) => refreshAll(import.meta.glob("./missing.ts", { eager: eager }));',
      ].join("\n"),
    },
  },
  {
    reach: "a glob import of a pattern not relative to its file",
    files: {
      "src/env.d.ts": BUNDLER_GLOBALS,
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/refresh.ts": [
        EACH_EXPORT,
        'refreshAll(import.meta.glob("/src/sales/*.ts", { eager: true }));',
      ].join("\n"),
    },
  },
];

for (const { reach, files } of REACHED_THROUGH_ITS_MODULE_OBJECT) {
  test(`refuses a query key read from the parameter of a function whose module is reached through ${reach}`, (t) => {
    assert.deepEqual(problemsIn(t, files), [
      "src/sales/invalidate.ts:4 uses a query key whose root the check cannot read",
    ]);
  });
}

const CALLED_UNDER_ANOTHER_NAME = [
  {
    reach: "a renamed import",
    files: {
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/refresh.ts": [
        'import { invalidate as refresh } from "./invalidate";',
        'export const refreshTicket = () => refresh(["ticket"]);',
      ].join("\n"),
    },
  },
  {
    reach: "a default import of a default-exported declaration",
    files: {
      "src/sales/invalidate.ts": INVALIDATE.replace("export function", "export default function"),
      "src/sales/refresh.ts": [
        'import refresh from "./invalidate";',
        'export const refreshTicket = () => refresh(["ticket"]);',
      ].join("\n"),
    },
  },
  {
    reach: "a default import of a function exported by name as the default",
    files: {
      "src/sales/invalidate.ts": `${INVALIDATE.replace("export function", "function")}\nexport default invalidate;`,
      "src/sales/refresh.ts": [
        'import refresh from "./invalidate";',
        'export const refreshTicket = () => refresh(["ticket"]);',
      ].join("\n"),
    },
  },
  {
    reach: "a renamed re-export",
    files: {
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/index.ts": 'export { invalidate as refresh } from "./invalidate";',
      "src/sales/refresh.ts": [
        'import { refresh } from "./index";',
        'export const refreshTicket = () => refresh(["ticket"]);',
      ].join("\n"),
    },
  },
];

for (const { reach, files } of CALLED_UNDER_ANOTHER_NAME) {
  test(`follows a key into a function called under another name through ${reach}`, (t) => {
    assert.deepEqual(problemsIn(t, files), [
      'src/sales/refresh.ts:2 roots a query key at "ticket", but the concept folder holding it is "sales"',
    ]);
  });
}

test("follows a key into a function whose module no dynamic import or glob import loads", (t) => {
  const problems = problemsIn(t, {
    "src/env.d.ts": BUNDLER_GLOBALS,
    "src/sales/invalidate.ts": INVALIDATE,
    "src/sales/other-keys.ts": "export const otherKeys = {};",
    "src/sales/refresh.ts": [
      'import { invalidate } from "./invalidate";',
      'export const refreshTicket = () => invalidate(["ticket"]);',
      'export const others = import.meta.glob(["./other-*.ts", "../migrations/*.sql"], { eager: true, import: "default", query: "?url" });',
      'export const otherLoaders = [import.meta.glob("./other-*.ts"), import.meta.glob("./other-*.ts", { eager: false })];',
      'export const otherLater = () => import("./other-keys");',
      "export const here = import.meta.url;",
      "export const flags = { require: false };",
      "export function Refresher() { return new.target; }",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/refresh.ts:2 roots a query key at "ticket", but the concept folder holding it is "sales"',
  ]);
});

const MENTIONED_WITHOUT_ITS_MODULE_OBJECT = [
  {
    mention: "a type-only import of its module",
    line: 'export type Keys = typeof import("./invalidate");',
  },
  {
    mention: "a side-effect import of its module",
    line: 'import "./invalidate";',
  },
  {
    mention: "a test file's namespace import and mock of its module",
    files: {
      "src/sales/refresh.test.ts": [
        'import { vi } from "vitest";',
        'import * as keys from "./invalidate";',
        'vi.mock("./invalidate", async (importOriginal) => importOriginal<typeof import("./invalidate")>());',
        "Object.values(keys);",
      ].join("\n"),
    },
  },
  {
    mention: "a type-only namespace import of its module",
    line: 'import type * as keys from "./invalidate";\nexport type Keys = typeof keys;',
  },
  {
    mention: "a type-only re-export of everything its module exports",
    line: 'export type * from "./invalidate";',
  },
  {
    mention: "a type-only re-export of its module as a namespace",
    line: 'export type * as keys from "./invalidate";',
  },
];

for (const { mention, files, line } of MENTIONED_WITHOUT_ITS_MODULE_OBJECT) {
  test(`follows a key into a function whose module is mentioned only through ${mention}`, (t) => {
    const problems = problemsIn(t, {
      "src/sales/invalidate.ts": INVALIDATE,
      "src/sales/refresh.ts": [
        'import { invalidate } from "./invalidate";',
        'export const refreshTicket = () => invalidate(["ticket"]);',
        ...(line === undefined ? [] : [line]),
      ].join("\n"),
      ...files,
    });

    assert.deepEqual(problems, [
      'src/sales/refresh.ts:2 roots a query key at "ticket", but the concept folder holding it is "sales"',
    ]);
  });
}

const RUNTIME_MODULE_LOADING = [
  { loading: "a require call", source: 'export const load = () => require("./other");' },
  { loading: "a require held in another name", source: "export const load = require;" },
  {
    loading: "a require handed on in a shorthand property",
    source: "export const loaders = { require };",
  },
  {
    loading: "a require given as the value of a named property",
    source: "export const loaders = { load: require };",
  },
  {
    loading: "the global require taken by destructuring",
    source: "export const { require: load } = globalThis;",
  },
  {
    loading: "the global require taken by a shorthand destructuring",
    source: "export const { require } = globalThis;",
  },
  {
    loading: "a require exported by an installed package",
    files: {
      "node_modules/loader-kit/package.json": '{ "name": "loader-kit", "types": "index.ts" }',
      "node_modules/loader-kit/index.ts": "export function require(path: string) { return path; }",
    },
    source: 'import { require } from "loader-kit"; export const loaded = require;',
  },
  { loading: "a module's require", source: 'export const load = () => module.require("./other");' },
  {
    loading: "the global require",
    source: 'export const load = () => globalThis.require("./other");',
  },
  {
    loading: "the global require read from a value typed any",
    source: 'export const load = () => (globalThis as any).require("./other");',
  },
  {
    loading: "the global require taken by a shorthand destructuring assignment into a local",
    source: 'let require; ({ require } = globalThis as any); require("./other");',
  },
  {
    loading: "the global require taken by a destructuring assignment into another local",
    source: "let load: unknown; ({ require: load } = globalThis as any); export { load };",
  },
  {
    loading: "the global require taken by a destructuring assignment nested in a property",
    source: "let load: unknown; ({ outer: { require: load } } = { outer: globalThis as any });",
  },
  {
    loading: "the global require taken by a destructuring assignment nested in an array",
    source: "let load: unknown; [{ require: load }] = [globalThis as any];",
  },
  {
    loading: "the global require taken by a destructuring assignment in a for-of loop",
    source: "let load: unknown; for ({ require: load } of [globalThis as any]);",
  },
  {
    loading: "the global require read through a string-literal access",
    source: 'export const load = () => globalThis["require"]("./other");',
  },
  {
    loading: "createRequire",
    source: "export const load = (make: Function) => make(createRequire);",
  },
  {
    loading: "a static import of node:module",
    source: 'export { builtinModules } from "node:module";',
  },
  {
    loading: "a static import of module",
    source: 'import * as modules from "module";\nexport { modules };',
  },
  {
    loading: "an import assignment of node:module",
    source: 'import modules = require("node:module");',
  },
  {
    loading: "a dynamic import of node:module",
    source: 'export const load = () => import("node:module");',
  },
  {
    loading: "a dynamic import of a path the check cannot read",
    source: "export const load = (path: string) => import(path);",
  },
];

for (const { loading, source, files } of RUNTIME_MODULE_LOADING) {
  test(`refuses runtime module loading through ${loading}, naming the file and line`, (t) => {
    const problems = problemsIn(t, { ...files, "src/sales/load.ts": `// loads\n${source}` });

    assert.deepEqual(problems, [
      "src/sales/load.ts:2 loads a module at run time, which the query key check cannot follow",
    ]);
  });
}

test("refuses a require its program declares only ambiently, where it is declared and where it is used", (t) => {
  const problems = problemsIn(t, {
    "src/env.d.ts": "declare var require: (path: string) => unknown;",
    "src/sales/load.ts": "export const load = require;",
  });

  assert.deepEqual(problems, [
    "src/env.d.ts:1 loads a module at run time, which the query key check cannot follow",
    "src/sales/load.ts:1 loads a module at run time, which the query key check cannot follow",
  ]);
});

test("refuses a require its program declares ambiently as a constructor", (t) => {
  const problems = problemsIn(t, {
    "src/env.d.ts": "declare var require: new (path: string) => object;",
    "src/sales/load.ts": "export const load = require;",
  });

  assert.deepEqual(problems, [
    "src/env.d.ts:1 loads a module at run time, which the query key check cannot follow",
    "src/sales/load.ts:1 loads a module at run time, which the query key check cannot follow",
  ]);
});

test("refuses a require its program declares ambiently as possibly undefined", (t) => {
  const problems = problemsIn(t, {
    "src/env.d.ts": "declare var require: ((path: string) => unknown) | undefined;",
    "src/sales/load.ts": "export const load = require;",
  });

  assert.deepEqual(problems, [
    "src/env.d.ts:1 loads a module at run time, which the query key check cannot follow",
    "src/sales/load.ts:1 loads a module at run time, which the query key check cannot follow",
  ]);
});

test("refuses a destructuring assignment into a require its program declares only ambiently", (t) => {
  const problems = problemsIn(t, {
    "src/env.d.ts": "declare let require: (path: string) => unknown;",
    "src/sales/load.ts": "({ require } = { require: (path: string) => path });",
  });

  assert.deepEqual(problems, [
    "src/env.d.ts:1 loads a module at run time, which the query key check cannot follow",
    "src/sales/load.ts:1 loads a module at run time, which the query key check cannot follow",
  ]);
});

test("refuses runtime module loading in a file the TypeScript program leaves out", (t) => {
  const problems = problemsIn(t, {
    "src/sales/load.js": 'export const load = () => require("./other");',
  });

  assert.deepEqual(problems, [
    "src/sales/load.js:1 loads a module at run time, which the query key check cannot follow",
  ]);
});

test("refuses runtime module loading in a test file", (t) => {
  const problems = problemsIn(t, {
    "src/sales/load.test.ts": 'export const load = () => require("./other");',
  });

  assert.deepEqual(problems, [
    "src/sales/load.test.ts:1 loads a module at run time, which the query key check cannot follow",
  ]);
});

test("accepts a dynamic import of a literal path, a property named require and the word module", (t) => {
  const problems = problemsIn(t, {
    "src/sales/other.ts": "export const other = 1;",
    "src/sales/load.ts": [
      'export const load = () => [import("./other"), import(`./other`)];',
      "export const flags = { require: false };",
      'export const kind = "module";',
    ].join("\n"),
  });

  assert.deepEqual(problems, []);
});

const NAMED_REQUIRE_LOADING_NOTHING = [
  { name: "a type member", source: "export interface Flags { require: boolean }" },
  {
    name: "a property read",
    source: "const flags = { require: false };\nexport const required = flags.require;",
  },
  {
    name: "a destructuring key",
    source: "const flags = { require: false };\nexport const { require: required } = flags;",
  },
  {
    name: "a destructured name",
    source:
      "const flags = { require: false };\nconst { require } = flags;\nexport const required = require;",
  },
  {
    name: "an array-destructured name",
    source: "const [require] = [false];\nexport const required = require;",
  },
  {
    name: "a name destructured from another key",
    source: "const flags = { load: false };\nexport const { load: require } = flags;",
  },
  {
    name: "a member of an interface declared in a declaration file",
    files: { "src/env.d.ts": "interface Flags { require: boolean }" },
    source: "declare const flags: Flags;\nexport const required = flags.require;",
  },
  {
    name: "a member read from a constant declared ambiently",
    source: "declare const flags: { require: boolean };\nexport const required = flags.require;",
  },
  {
    name: "a string-literal access to a record",
    source:
      'declare const flags: Record<string, boolean>;\nexport const required = flags["require"];',
  },
  {
    name: "a key of an object compared with another value",
    source: "let load: unknown;\nexport const same = { require: load } == (globalThis as any);",
  },
  {
    name: "a key of an object iterated by a for-of loop",
    source: "let load: unknown;\nfor (const entry of [{ require: load }]) void entry;",
  },
  {
    name: "a local written from another key by a destructuring assignment",
    source: "let require = false;\n({ load: require } = { load: true });",
  },
  {
    name: "a key a destructuring assignment writes into a local typed any",
    source: "let load: any;\n({ require: load } = { require: false });",
  },
  {
    name: "an array whose type the library declares",
    source: "const require: string[] = [];\nexport const required = require;",
  },
  {
    name: "a member whose ambiently declared type has no call signatures",
    source: "declare const flags: { require: Date };\nexport const required = flags.require;",
  },
  { name: "a method", source: "export const loader = { require() { return 1; } };" },
  {
    name: "an imported function the program itself declares",
    files: { "src/sales/flags.ts": "export function createRequire() { return 1; }" },
    source: 'import { createRequire } from "./flags";\nexport const made = createRequire();',
  },
];

for (const { name, source, files } of NAMED_REQUIRE_LOADING_NOTHING) {
  test(`accepts ${name} named like a module loader`, (t) => {
    assert.deepEqual(problemsIn(t, { ...files, "src/sales/flags-use.ts": source }), []);
  });
}

test("follows a key into a function whose type is also read", (t) => {
  const problems = problemsIn(t, {
    "src/sales/invalidate.ts": INVALIDATE,
    "src/sales/refresh.ts": [
      'import { invalidate } from "./invalidate";',
      "export type Invalidate = typeof invalidate;",
      'export const refreshTicket = () => invalidate(["ticket"]);',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/refresh.ts:3 roots a query key at "ticket", but the concept folder holding it is "sales"',
  ]);
});

test("follows a key into a function its documentation mentions by name", (t) => {
  const problems = problemsIn(t, {
    "src/sales/invalidate.ts": INVALIDATE,
    "src/sales/refresh.ts": [
      'import { invalidate } from "./invalidate";',
      "/**",
      " * Refreshes the ticket through {@link invalidate}.",
      " * @see invalidate",
      " */",
      'export const refreshTicket = () => invalidate(["ticket"]);',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/refresh.ts:6 roots a query key at "ticket", but the concept folder holding it is "sales"',
  ]);
});

test("refuses a query key read from the parameter of a method of an object typed with an interface that declares it", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-keys.ts": [
      IMPORTS,
      "const client = new QueryClient();",
      "interface SalesKeys {",
      "  invalidate(key: QueryKey): void;",
      "}",
      "export const salesKeys: SalesKeys = {",
      "  invalidate(key: QueryKey) {",
      "    client.invalidateQueries({ queryKey: key });",
      "  },",
      "};",
      'export const refreshTicket = () => salesKeys.invalidate(["ticket"]);',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/sales-keys.ts:8 uses a query key whose root the check cannot read",
    'src/sales/sales-keys.ts:11 roots a query key at "ticket", but the concept folder holding it is "sales"',
  ]);
});

test("refuses a query key read from the parameter of a function property of an object typed with an interface that declares it", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-keys.ts": [
      IMPORTS,
      "const client = new QueryClient();",
      "interface SalesKeys {",
      "  invalidate: (key: QueryKey) => void;",
      "}",
      "export const salesKeys: SalesKeys = {",
      "  invalidate: (key: QueryKey) => client.invalidateQueries({ queryKey: key }),",
      "};",
      'export const refreshTicket = () => salesKeys.invalidate(["ticket"]);',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/sales-keys.ts:7 uses a query key whose root the check cannot read",
    'src/sales/sales-keys.ts:9 roots a query key at "ticket", but the concept folder holding it is "sales"',
  ]);
});

test("refuses a query key read from the parameters of the methods of two objects typed with one interface", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-keys.ts": [
      IMPORTS,
      "const client = new QueryClient();",
      "interface SalesKeys {",
      "  invalidate(key: QueryKey): void;",
      "}",
      "export const salesKeys: SalesKeys = {",
      "  invalidate(key: QueryKey) {",
      "    client.invalidateQueries({ queryKey: key });",
      "  },",
      "};",
      "export const receiptKeys: SalesKeys = {",
      "  invalidate: (key: QueryKey) => client.invalidateQueries({ queryKey: key }),",
      "};",
      'export const refreshTicket = () => salesKeys.invalidate(["ticket"]);',
      'export const refreshReceipt = () => receiptKeys.invalidate(["receipt"]);',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/sales-keys.ts:8 uses a query key whose root the check cannot read",
    "src/sales/sales-keys.ts:12 uses a query key whose root the check cannot read",
    'src/sales/sales-keys.ts:14 roots a query key at "ticket", but the concept folder holding it is "sales"',
    'src/sales/sales-keys.ts:15 roots a query key at "receipt", but the concept folder holding it is "sales"',
  ]);
});

const CALLED_THROUGH_A_LOOSER_SIGNATURE = [
  {
    reach: "a function type, with a spread argument",
    files: {
      "src/sales/sales-keys.ts": [
        IMPORTS,
        "const client = new QueryClient();",
        "const invalidate: (...keys: readonly unknown[][]) => void = (_scope: unknown, key: QueryKey) =>",
        "  client.invalidateQueries({ queryKey: key });",
        'const keys = [["ticket"]];',
        'export const refreshTicket = () => invalidate(...keys, ["sale"]);',
      ].join("\n"),
    },
    problems: ["src/sales/sales-keys.ts:6 uses a query key whose root the check cannot read"],
  },
  {
    reach: "a function type, into a function declaring its this parameter",
    files: {
      "src/sales/sales-keys.ts": [
        IMPORTS,
        "const client = new QueryClient();",
        "const invalidate: (key: readonly unknown[]) => void = function (this: void, key: QueryKey) {",
        "  client.invalidateQueries({ queryKey: key });",
        "};",
        'export const refreshTicket = () => invalidate(["ticket"]);',
      ].join("\n"),
    },
    problems: [
      'src/sales/sales-keys.ts:6 roots a query key at "ticket", but the concept folder holding it is "sales"',
    ],
  },
  {
    reach: "a function type, into a rest parameter",
    files: {
      "src/sales/sales-keys.ts": [
        IMPORTS,
        "const client = new QueryClient();",
        "const invalidate: (...key: readonly unknown[]) => void = (...key: QueryKey) =>",
        "  client.invalidateQueries({ queryKey: key });",
        'export const refreshTicket = () => invalidate(["ticket"]);',
      ].join("\n"),
    },
    problems: ["src/sales/sales-keys.ts:5 uses a query key whose root the check cannot read"],
  },
  {
    reach: "a function type, into a destructured parameter",
    files: {
      "src/sales/sales-keys.ts": [
        IMPORTS,
        "const client = new QueryClient();",
        "type Options = { key: readonly unknown[] };",
        "const invalidate: (options: Options) => void = ({ key }: { key: QueryKey }) =>",
        "  client.invalidateQueries({ queryKey: key });",
        'const key = ["receipt"];',
        'const options = { key: ["sale"] };',
        "export function refreshAll() {",
        '  invalidate({ key: ["ticket"], label: ["sale"] });',
        "  invalidate({ key });",
        "  invalidate({ ...options });",
        "  invalidate(options);",
        '  invalidate({ ["key"]: ["sale"] });',
        "}",
      ].join("\n"),
    },
    problems: [
      'src/sales/sales-keys.ts:6 roots a query key at "receipt", but the concept folder holding it is "sales"',
      'src/sales/sales-keys.ts:9 roots a query key at "ticket", but the concept folder holding it is "sales"',
      "src/sales/sales-keys.ts:11 uses a query key whose root the check cannot read",
      "src/sales/sales-keys.ts:12 uses a query key whose root the check cannot read",
      "src/sales/sales-keys.ts:13 uses a query key whose root the check cannot read",
    ],
  },
];

for (const { reach, files, problems } of CALLED_THROUGH_A_LOOSER_SIGNATURE) {
  test(`checks a key passed to a function through ${reach} that does not type it as a query key`, (t) => {
    assert.deepEqual(problemsIn(t, files), problems);
  });
}

const IMPLEMENTING_A_LOOSER_SIGNATURE = [
  {
    reach: "an interface's method signature typing the key more loosely",
    files: {
      "src/sales/sales-keys.ts": [
        IMPORTS,
        "const client = new QueryClient();",
        "interface SalesKeys {",
        "  invalidate(key: readonly unknown[]): void;",
        "}",
        "export const salesKeys: SalesKeys = {",
        "  invalidate(key: QueryKey) {",
        "    client.invalidateQueries({ queryKey: key });",
        "  },",
        "};",
        'export const refreshTicket = () => salesKeys.invalidate(["ticket"]);',
      ].join("\n"),
    },
    problems: ["src/sales/sales-keys.ts:8 uses a query key whose root the check cannot read"],
  },
  {
    reach: "an interface's property signature typing the key more loosely",
    files: {
      "src/sales/sales-keys.ts": [
        IMPORTS,
        "const client = new QueryClient();",
        "interface SalesKeys {",
        "  invalidate: (key: readonly unknown[]) => void;",
        "}",
        "export const salesKeys: SalesKeys = {",
        "  invalidate: (key: QueryKey) => client.invalidateQueries({ queryKey: key }),",
        "};",
        'export const refreshTicket = () => salesKeys.invalidate(["ticket"]);',
      ].join("\n"),
    },
    problems: ["src/sales/sales-keys.ts:7 uses a query key whose root the check cannot read"],
  },
  {
    reach: "a class method of an interface typing the key more loosely",
    files: {
      "src/sales/sales-keys.ts": [
        IMPORTS,
        "const client = new QueryClient();",
        "interface SalesKeys {",
        "  invalidate(key: readonly unknown[]): void;",
        "}",
        "class SalesKeysCache implements SalesKeys {",
        "  invalidate(key: QueryKey) {",
        "    client.invalidateQueries({ queryKey: key });",
        "  }",
        "}",
        "export const salesKeys: SalesKeys = new SalesKeysCache();",
        'export const refreshTicket = () => salesKeys.invalidate(["ticket"]);',
      ].join("\n"),
    },
    problems: ["src/sales/sales-keys.ts:8 uses a query key whose root the check cannot read"],
  },
  {
    reach: "a component's type typing the destructured prop more loosely",
    files: {
      "src/sales/ticket-panel.tsx": [
        IMPORTS,
        "type Props = { source: readonly unknown[] };",
        "export const TicketPanel: (props: Props) => null = ({ source }: { source: QueryKey }) => {",
        "  useQuery({ queryKey: source, queryFn: () => [] });",
        "  return null;",
        "};",
        'const props = { source: ["sale"] };',
        "export const panels = [",
        '  <TicketPanel source={["ticket"]} />,',
        "  <TicketPanel {...props} />,",
        "  <TicketPanel source />,",
        "];",
      ].join("\n"),
    },
    problems: ["src/sales/ticket-panel.tsx:4 uses a query key whose root the check cannot read"],
  },
];

for (const { reach, files, problems } of IMPLEMENTING_A_LOOSER_SIGNATURE) {
  test(`refuses a query key read from the parameter of a function implementing ${reach}`, (t) => {
    assert.deepEqual(problemsIn(t, files), problems);
  });
}

test("accepts a call through a signature that does not type the key as a query key and passes none", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-keys.ts": [
      IMPORTS,
      "const client = new QueryClient();",
      "const invalidate: (key?: readonly unknown[]) => void = (key?: QueryKey) =>",
      "  client.invalidateQueries({ queryKey: key });",
      "export const refreshAll = () => invalidate();",
    ].join("\n"),
  });

  assert.deepEqual(problems, []);
});

test("refuses a query key read from the parameter of a method of an object assigned to a variable or iterated by a for-of loop", (t) => {
  const problems = problemsIn(t, {
    "src/sales/assigned.ts": [
      IMPORTS,
      "const client = new QueryClient();",
      "let salesKeys: { invalidate(key: QueryKey): void };",
      "salesKeys = {",
      "  invalidate(key: QueryKey) {",
      "    client.invalidateQueries({ queryKey: key });",
      "  },",
      "};",
      'export const refreshTicket = () => salesKeys.invalidate(["ticket"]);',
    ].join("\n"),
    "src/sales/iterated.ts": [
      IMPORTS,
      "const client = new QueryClient();",
      "export function refreshAll() {",
      "  for (const salesKeys of [{ invalidate: (key: QueryKey) => client.invalidateQueries({ queryKey: key }) }]) {",
      '    salesKeys.invalidate(["receipt"]);',
      "  }",
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/assigned.ts:6 uses a query key whose root the check cannot read",
    'src/sales/assigned.ts:9 roots a query key at "ticket", but the concept folder holding it is "sales"',
    "src/sales/iterated.ts:4 uses a query key whose root the check cannot read",
    'src/sales/iterated.ts:5 roots a query key at "receipt", but the concept folder holding it is "sales"',
  ]);
});

test("follows a key into a function whose name only other objects' destructuring assignments take", (t) => {
  const problems = problemsIn(t, {
    "src/sales/invalidate.ts": INVALIDATE,
    "src/sales/refresh.ts": [
      'import { invalidate } from "./invalidate";',
      "let refresh: () => void;",
      "let other: () => void;",
      "({ invalidate: refresh } = { invalidate: () => {} });",
      "[...[{ invalidate: other }]] = [{ invalidate: () => {} }];",
      'export const refreshTicket = () => invalidate(["ticket"]);',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/refresh.ts:6 roots a query key at "ticket", but the concept folder holding it is "sales"',
  ]);
});

test("refuses a query key read from the parameter of a method called or typed through a string-literal access", (t) => {
  const problems = problemsIn(t, {
    "src/sales/invalidate.ts": SALES_KEYS,
    "src/sales/refresh.ts": [
      'import { salesKeys } from "./invalidate";',
      'export type Invalidate = (typeof salesKeys)["invalidate"];',
      'export const refreshTicket = () => salesKeys["invalidate"](["ticket"]);',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/invalidate.ts:5 uses a query key whose root the check cannot read",
    'src/sales/refresh.ts:3 roots a query key at "ticket", but the concept folder holding it is "sales"',
  ]);
});

test("refuses a query key read from the parameter of a method handed on uncalled through a string-literal access", (t) => {
  const problems = problemsIn(t, {
    "src/sales/invalidate.ts": SALES_KEYS,
    "src/sales/refresh.ts": [
      'import { salesKeys } from "./invalidate";',
      'export const refreshAll = () => [["ticket"]].forEach(salesKeys["invalidate"]);',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/invalidate.ts:5 uses a query key whose root the check cannot read",
  ]);
});

test("refuses a query key read from the parameter of a function handed on uncalled in a class's extends clause", (t) => {
  const problems = problemsIn(t, {
    "src/sales/invalidate.ts": INVALIDATE,
    "src/sales/refresh.ts": [
      'import { invalidate } from "./invalidate";',
      "declare function refreshing(refresh: unknown): new () => object;",
      "export class Refresher extends refreshing(invalidate) {}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/invalidate.ts:4 uses a query key whose root the check cannot read",
  ]);
});

test("refuses a key whose root the check cannot read, naming where it is used", (t) => {
  const problems = problemsIn(t, {
    "src/catalog/catalog-queries.ts": [
      IMPORTS,
      "export function useProducts(root: string, keys: QueryKey[]) {",
      '  useQuery({ queryKey: [root, "products"], queryFn: () => [] });',
      "  useQuery({ queryKey: keys[0], queryFn: () => [] });",
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/catalog/catalog-queries.ts:3 uses a query key whose root the check cannot read",
    "src/catalog/catalog-queries.ts:4 uses a query key whose root the check cannot read",
  ]);
});

test("refuses a key built in a file that sits in no concept folder", (t) => {
  const problems = problemsIn(t, {
    "src/main.ts": [
      IMPORTS,
      'export const useSession = () => useQuery({ queryKey: ["session"], queryFn: () => [] });',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/main.ts:2 roots a query key at "session", but no concept folder holds it',
  ]);
});

test("refuses a key rooted at a folder that holds no concept", (t) => {
  const problems = problemsIn(
    t,
    {
      "src/shell/session.ts": [
        IMPORTS,
        'export const useSession = () => useQuery({ queryKey: ["shell"], queryFn: () => [] });',
      ].join("\n"),
    },
    ["shell"],
  );

  assert.deepEqual(problems, [
    'src/shell/session.ts:2 roots a query key at "shell", but no concept folder holds it',
  ]);
});

test("fails when a folder listed as holding no concept does not exist", (t) => {
  const problems = problemsIn(
    t,
    { "src/catalog/catalog-queries.ts": 'export const catalogKey = ["catalog"] as const;' },
    ["shell"],
  );

  assert.deepEqual(problems, [
    "src/shell is listed as holding no concept, but there is no such folder",
  ]);
});

test("checks only the query keys used under the source root", (t) => {
  const problems = problemsIn(t, {
    "src/catalog/catalog-queries.ts": 'export const catalogKey = ["catalog"] as const;',
    "other/core.ts": [
      IMPORTS,
      'export const useCore = () => useQuery({ queryKey: ["core"], queryFn: () => [] });',
    ].join("\n"),
    "tsconfig.json": TSCONFIG.replace('["src"]', '["src", "other"]'),
  });

  assert.deepEqual(problems, []);
});

test("leaves out test files, which seed other concepts' keys to prove a query leaves them alone", (t) => {
  const problems = problemsIn(t, {
    "src/branch/branch-queries.test.ts": [
      IMPORTS,
      'new QueryClient().setQueryData(["catalog", "brands"], []);',
    ].join("\n"),
    "src/branch/test-support/branch-screen.ts": [
      IMPORTS,
      'new QueryClient().setQueryData(["catalog", "brands"], []);',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/branch/test-support/branch-screen.ts:2 roots a query key at "catalog", but the concept folder holding it is "branch"',
  ]);
});

test("every query key in the backoffice and the register's screens is rooted at its concept folder", () => {
  for (const source of QUERY_KEY_SOURCES) {
    assert.deepEqual(findQueryRootKeyProblems(source, repoRoot), [], source.sourceRoot);
  }
});
