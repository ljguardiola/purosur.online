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

test("checks a key handed to a component through a prop typed as a query key", (t) => {
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
    'src/sales/ticket-panel.tsx:6 roots a query key at "ticket", but the concept folder holding it is "sales"',
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
