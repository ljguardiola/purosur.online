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
  "node_modules/@tanstack/react-query/index.d.ts": [
    'export * from "@tanstack/query-core";',
    'import type { QueryKey, QueryOptions } from "@tanstack/query-core";',
    "export declare function queryOptions<TQueryKey extends QueryKey>(options: QueryOptions<TQueryKey>): QueryOptions<TQueryKey> & { queryKey: TQueryKey };",
    "export declare function infiniteQueryOptions<TQueryKey extends QueryKey>(options: QueryOptions<TQueryKey>): QueryOptions<TQueryKey> & { queryKey: TQueryKey };",
  ].join("\n"),
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

test("refuses a query key read from the parameter of a callback written inline", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-refresh.ts": [
      IMPORTS,
      "const client = new QueryClient();",
      "const invalidateNow = (key: QueryKey) => client.invalidateQueries({ queryKey: key });",
      "export function refreshAll() {",
      '  [["sale"]].forEach((key: QueryKey) => client.invalidateQueries({ queryKey: key }));',
      '  invalidateNow(["receipt"]);',
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/sales-refresh.ts:5 uses a query key whose root the check cannot read",
    'src/sales/sales-refresh.ts:6 roots a query key at "receipt", but the concept folder holding it is "sales"',
  ]);
});

test("refuses a query key read from the parameter of a helper handed on by name as a callback", (t) => {
  const problems = problemsIn(t, {
    "src/catalog/catalog-refresh.ts": [
      IMPORTS,
      "const client = new QueryClient();",
      "const invalidate = (key: QueryKey) => client.invalidateQueries({ queryKey: key });",
      "function invalidateNow(key: QueryKey) {",
      "  client.invalidateQueries({ queryKey: key });",
      "}",
      "export const catalogActions = {",
      "  invalidate(key: QueryKey) {",
      "    client.invalidateQueries({ queryKey: key });",
      "  },",
      "};",
      "export function useCatalogActions() {",
      "  const refresh = (key: QueryKey) => client.invalidateQueries({ queryKey: key });",
      "  return { refresh };",
      "}",
      "export function refreshAll() {",
      '  [["catalog"]].forEach(invalidate);',
      '  [["catalog"]].forEach(invalidateNow);',
      '  [["catalog"]].forEach(catalogActions.invalidate);',
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/catalog/catalog-refresh.ts:3 uses a query key whose root the check cannot read",
    "src/catalog/catalog-refresh.ts:5 uses a query key whose root the check cannot read",
    "src/catalog/catalog-refresh.ts:9 uses a query key whose root the check cannot read",
    "src/catalog/catalog-refresh.ts:13 uses a query key whose root the check cannot read",
  ]);
});

test("follows a key into a helper that is only called, imported, re-exported, rendered or named in a type", (t) => {
  const problems = problemsIn(t, {
    "src/platform/invalidate.ts": [
      IMPORTS,
      "const client = new QueryClient();",
      "export const invalidate = (key: QueryKey) => client.invalidateQueries({ queryKey: key });",
      "export type Invalidate = typeof invalidate;",
    ].join("\n"),
    "src/platform/index.ts": 'export { invalidate } from "./invalidate";',
    "src/sales/ticket-panel.tsx": [
      IMPORTS,
      'import { invalidate } from "../platform";',
      "export function TicketPanel({ source }: { source: QueryKey }) {",
      "  useQuery({ queryKey: source, queryFn: () => [] });",
      "  return null;",
      "}",
      'export const refreshTicket = () => invalidate(["ticket"]);',
      'export const ticketPanel = <TicketPanel source={["receipt"]}></TicketPanel>;',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/ticket-panel.tsx:7 roots a query key at "ticket", but the concept folder holding it is "sales"',
    'src/sales/ticket-panel.tsx:8 roots a query key at "receipt", but the concept folder holding it is "sales"',
  ]);
});

test("follows a key into a helper that is exported and imported as a module's default", (t) => {
  const problems = problemsIn(t, {
    "src/platform/set-query-answer.ts": [
      IMPORTS,
      "function setQueryAnswer(client: QueryClient, key: QueryKey) {",
      "  client.setQueryData(key, 1);",
      "}",
      "export default setQueryAnswer;",
    ].join("\n"),
    "src/sales/sales-answer.ts": [
      IMPORTS,
      'import setQueryAnswer from "../platform/set-query-answer";',
      'export const answer = (client: QueryClient) => setQueryAnswer(client, ["ticket"]);',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-answer.ts:3 roots a query key at "ticket", but the concept folder holding it is "sales"',
  ]);
});

test("follows a key read back through the query options it was declared in", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      'import { QueryClient, queryOptions, infiniteQueryOptions } from "@tanstack/react-query";',
      'const ticketOptions = queryOptions({ queryKey: ["sales", "ticket"], queryFn: () => [] });',
      'const receiptOptions = queryOptions({ queryKey: ["receipts"], queryFn: () => [] });',
      'const pageOptions = infiniteQueryOptions({ queryKey: ["sales", "pages"], queryFn: () => [] });',
      'const lineOptions = () => queryOptions({ queryKey: ["sales", "lines"], queryFn: () => [] });',
      "export function refresh(client: QueryClient) {",
      "  client.invalidateQueries({ queryKey: ticketOptions.queryKey });",
      "  client.invalidateQueries({ queryKey: receiptOptions.queryKey });",
      "  client.invalidateQueries({ queryKey: pageOptions.queryKey });",
      "  client.invalidateQueries({ queryKey: lineOptions().queryKey });",
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-queries.ts:3 roots a query key at "receipts", but the concept folder holding it is "sales"',
  ]);
});

test("follows a key read from a parameter that is not destructured", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.tsx": [
      IMPORTS,
      "type Ticket = { queryKey: QueryKey; queryFn: () => unknown };",
      "export function TicketPanel(props: { source: QueryKey }) {",
      "  useQuery({ queryKey: props.source, queryFn: () => [] });",
      "  return null;",
      "}",
      "export function useTicket(query: Ticket) {",
      "  return useQuery({ queryKey: query.queryKey, queryFn: query.queryFn });",
      "}",
      "export function useReceipt(props: { key: QueryKey }) {",
      "  const { key } = props;",
      "  return useQuery({ queryKey: key, queryFn: () => [] });",
      "}",
      'export const ticketPanel = <TicketPanel source={["sales"]} />;',
      'export const useSales = () => useTicket({ queryKey: ["sales"], queryFn: () => [] });',
      'export const useReceipts = () => useReceipt({ key: ["receipts"] });',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-queries.tsx:16 roots a query key at "receipts", but the concept folder holding it is "sales"',
  ]);
});

test("checks a parameter typed as a query key or nothing", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-answer.ts": [
      IMPORTS,
      "export function setAnswer(client: QueryClient, key: QueryKey | undefined) {",
      "  if (key) client.setQueryData(key, 1);",
      "}",
      'export const answer = (client: QueryClient) => setAnswer(client, ["ticket"]);',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-answer.ts:5 roots a query key at "ticket", but the concept folder holding it is "sales"',
  ]);
});

test("checks a key named queryKey in an options object built apart from the query", (t) => {
  const problems = problemsIn(t, {
    "src/stock/stock-queries.ts": [
      IMPORTS,
      'const balancesOptions = { queryKey: ["balances"], queryFn: () => [] };',
      'const queryKey = ["movements"];',
      "const movementsOptions = { queryKey, queryFn: () => [] };",
      "export const useBalances = () => useQuery({ ...balancesOptions });",
      "export const useMovements = () => useQuery({ ...movementsOptions });",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/stock/stock-queries.ts:2 roots a query key at "balances", but the concept folder holding it is "stock"',
    'src/stock/stock-queries.ts:3 roots a query key at "movements", but the concept folder holding it is "stock"',
  ]);
});

test("checks a key given in shorthand to a property typed as a query key", (t) => {
  const problems = problemsIn(t, {
    "src/platform/use-cloud-query.ts": [
      IMPORTS,
      "export function useCloudQuery({ key }: { key: QueryKey }) {",
      "  return useQuery({ queryKey: key, queryFn: () => [] });",
      "}",
    ].join("\n"),
    "src/alerts/alerts-queries.ts": [
      'import { useCloudQuery } from "../platform/use-cloud-query";',
      'const key = ["overview"] as const;',
      "export const useOverview = () => useCloudQuery({ key });",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/alerts/alerts-queries.ts:2 roots a query key at "overview", but the concept folder holding it is "alerts"',
  ]);
});

test("checks both roots of a key chosen by a condition", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      IMPORTS,
      "export const useSales = (open: boolean) =>",
      '  useQuery({ queryKey: open ? ["sales", "open"] : ["receipts"], queryFn: () => [] });',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-queries.ts:3 roots a query key at "receipts", but the concept folder holding it is "sales"',
  ]);
});

test("refuses a key read from a parameter typed by the program's own type named QueryKey", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      'import { useQuery } from "@tanstack/react-query";',
      "type QueryKey = readonly string[];",
      "export function useTicket(key: QueryKey) {",
      "  return useQuery({ queryKey: key, queryFn: () => [] });",
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/sales-queries.ts:4 uses a query key whose root the check cannot read",
  ]);
});

test("refuses a key held in a variable that is reassigned", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      IMPORTS,
      "export function useSales(open: boolean) {",
      '  let key = ["sales"];',
      '  if (open) key = ["receipts"];',
      "  return useQuery({ queryKey: key, queryFn: () => [] });",
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/sales-queries.ts:5 uses a query key whose root the check cannot read",
  ]);
});

test("refuses a key read from a parameter or a destructured property not typed as a query key", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      IMPORTS,
      "export function useTicket(key: readonly string[]) {",
      "  return useQuery({ queryKey: key, queryFn: () => [] });",
      "}",
      "export function useReceipt({ key }: { key: readonly string[] }) {",
      "  return useQuery({ queryKey: key, queryFn: () => [] });",
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/sales-queries.ts:3 uses a query key whose root the check cannot read",
    "src/sales/sales-queries.ts:6 uses a query key whose root the check cannot read",
  ]);
});

test("refuses a query key read from a destructured parameter of a callback written inline", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-refresh.ts": [
      IMPORTS,
      "const client = new QueryClient();",
      "export function refreshAll() {",
      '  [{ key: ["sale"] }].forEach(({ key }: { key: QueryKey }) => client.invalidateQueries({ queryKey: key }));',
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/sales-refresh.ts:4 uses a query key whose root the check cannot read",
  ]);
});

test("a file that loads a module at run time draws no problem from the check", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-loader.ts": [
      'import { createRequire } from "node:module";',
      "const require = createRequire(import.meta.url);",
      'export const loaded = require("./other");',
    ].join("\n"),
  });

  assert.deepEqual(problems, []);
});

test("follows a key into a helper whose module is imported as a namespace", (t) => {
  const problems = problemsIn(t, {
    "src/platform/use-cloud-query.ts": [
      IMPORTS,
      "export function useCloudQuery({ queryKey }: { queryKey: QueryKey }) {",
      "  return useQuery({ queryKey, queryFn: () => [] });",
      "}",
    ].join("\n"),
    "src/alerts/alerts-queries.ts": [
      'import * as cloud from "../platform/use-cloud-query";',
      'export const useOverview = () => cloud.useCloudQuery({ queryKey: ["overview"] });',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/alerts/alerts-queries.ts:2 roots a query key at "overview", but the concept folder holding it is "alerts"',
  ]);
});

test("follows a key into a method of an object that forwards it", (t) => {
  const problems = problemsIn(t, {
    "src/stock/stock-queries.ts": [
      IMPORTS,
      "const client = new QueryClient();",
      "export const stockActions = {",
      "  invalidate(key: QueryKey) {",
      "    client.invalidateQueries({ queryKey: key });",
      "  },",
      "  reset: (key: QueryKey) => client.invalidateQueries({ queryKey: key }),",
      "};",
      'export const refreshBalances = () => stockActions.invalidate(["balances"]);',
      'export const resetMovements = () => stockActions.reset(["movements"]);',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/stock/stock-queries.ts:9 roots a query key at "balances", but the concept folder holding it is "stock"',
    'src/stock/stock-queries.ts:10 roots a query key at "movements", but the concept folder holding it is "stock"',
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

test("names only the key's own line when query options spanning several lines hold an unreadable key", (t) => {
  const problems = problemsIn(t, {
    "src/catalog/catalog-queries.ts": [
      IMPORTS,
      "export function useProducts(keys: QueryKey[]) {",
      "  useQuery({",
      "    queryKey: keys[0],",
      "    queryFn: () => [],",
      "  });",
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
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

test("follows a key into a helper named in a type through its object or its module", (t) => {
  const problems = problemsIn(t, {
    "src/platform/invalidate.ts": [
      IMPORTS,
      "const client = new QueryClient();",
      "export const invalidate = (key: QueryKey) => client.invalidateQueries({ queryKey: key });",
    ].join("\n"),
    "src/sales/sales-actions.ts": [
      IMPORTS,
      'import * as keys from "../platform/invalidate";',
      "const client = new QueryClient();",
      "export const salesActions = {",
      "  invalidate(key: QueryKey) {",
      "    client.invalidateQueries({ queryKey: key });",
      "  },",
      "};",
      "export type Invalidate = typeof salesActions.invalidate;",
      "export type InvalidateArguments = Parameters<typeof keys.invalidate>;",
      "export function refresh() {",
      '  salesActions.invalidate(["receipts"]);',
      '  keys.invalidate(["tickets"]);',
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-actions.ts:12 roots a query key at "receipts", but the concept folder holding it is "sales"',
    'src/sales/sales-actions.ts:13 roots a query key at "tickets", but the concept folder holding it is "sales"',
  ]);
});

test("checks a key in an argument object built apart from the call to a helper", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      IMPORTS,
      "export function useReceipt(props: { key: QueryKey }) {",
      "  return useQuery({ queryKey: props.key, queryFn: () => [] });",
      "}",
      "export function useTicket({ key }: { key: QueryKey }) {",
      "  return useQuery({ queryKey: key, queryFn: () => [] });",
      "}",
      'const receiptQuery = { key: ["receipts"] };',
      'const ticketQuery = { key: ["tickets"] };',
      'const salesQuery = { key: ["sales"] };',
      'const draftQuery = () => ({ key: ["drafts"] });',
      "export const useReceipts = () => useReceipt(receiptQuery);",
      "export const useTickets = () => useTicket(ticketQuery);",
      "export const useDrafts = () => useTicket(draftQuery());",
      "export const useSalesReceipts = () => useReceipt(salesQuery);",
      "export const useSalesTickets = () => useTicket(salesQuery);",
      "const exactFilters = { exact: true };",
      "export const refreshAll = (client: QueryClient) => client.invalidateQueries(exactFilters);",
      "export function useLines(options?: { key: QueryKey }) {",
      '  return useQuery({ queryKey: options ? options.key : ["sales"], queryFn: () => [] });',
      "}",
      'const lineQuery = { key: ["lines"] };',
      "export const useSalesLines = () => useLines(lineQuery);",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-queries.ts:8 roots a query key at "receipts", but the concept folder holding it is "sales"',
    'src/sales/sales-queries.ts:9 roots a query key at "tickets", but the concept folder holding it is "sales"',
    'src/sales/sales-queries.ts:11 roots a query key at "drafts", but the concept folder holding it is "sales"',
    'src/sales/sales-queries.ts:22 roots a query key at "lines", but the concept folder holding it is "sales"',
  ]);
});

test("checks a key spread into an argument object from an object built elsewhere", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      IMPORTS,
      "export function useReceipt(props: { key: QueryKey; fresh?: boolean }) {",
      "  return useQuery({ queryKey: props.key, queryFn: () => [] });",
      "}",
      'const receiptQuery = () => ({ key: ["receipts"] });',
      'const salesQuery = () => ({ key: ["sales"] });',
      'const ticketBase = { key: ["tickets"] };',
      "const ticketQuery = { ...ticketBase, fresh: true };",
      "export const useReceipts = () => useReceipt({ ...receiptQuery(), fresh: true });",
      "export const useSales = () => useReceipt({ ...salesQuery(), fresh: true });",
      "export const useTickets = () => useReceipt(ticketQuery);",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-queries.ts:5 roots a query key at "receipts", but the concept folder holding it is "sales"',
    'src/sales/sales-queries.ts:7 roots a query key at "tickets", but the concept folder holding it is "sales"',
  ]);
});

test("checks a key in props built apart from the component and spread into it", (t) => {
  const problems = problemsIn(t, {
    "src/sales/ticket-panel.tsx": [
      IMPORTS,
      "function Panel({ source }: { source: QueryKey }) {",
      "  useQuery({ queryKey: source, queryFn: () => [] });",
      "  return null;",
      "}",
      'const panelProps = { source: ["receipts"] };',
      'const salesProps = { source: ["sales"] };',
      "export const receiptPanel = <Panel {...panelProps} />;",
      "export const salesPanel = <Panel {...salesProps} />;",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/ticket-panel.tsx:6 roots a query key at "receipts", but the concept folder holding it is "sales"',
  ]);
});

test("accepts a key written beside a spread of an object whose type has no such key", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.tsx": [
      IMPORTS,
      "export function useReceipt(props: { key: QueryKey; fresh?: boolean }) {",
      "  return useQuery({ queryKey: props.key, queryFn: () => [] });",
      "}",
      "function Panel({ source }: { source: QueryKey; title?: string }) {",
      "  useQuery({ queryKey: source, queryFn: () => [] });",
      "  return null;",
      "}",
      "export function useSales(options: { staleTime?: number }, queryFn: () => unknown) {",
      '  return useQuery({ ...options, queryKey: ["sales"], queryFn });',
      "}",
      "export function SalesPanel(props: { title?: string }) {",
      '  return <Panel {...props} source={["sales"]} />;',
      "}",
      'export const useFreshSales = (flags: { fresh?: boolean }) => useReceipt({ ...flags, key: ["sales"] });',
      'export function useLatestSales(options: Omit<{ queryKey: QueryKey; staleTime?: number }, "queryKey">) {',
      '  return useQuery({ queryKey: ["sales"], ...options, queryFn: () => [] });',
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, []);
});

test("follows a key from a spread that overrides an earlier member of the same name", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      IMPORTS,
      "export function useReceipt(props: { key: QueryKey }) {",
      "  return useQuery({ queryKey: props.key, queryFn: () => [] });",
      "}",
      'const base = { key: ["ticket"] as QueryKey };',
      'const options = { key: ["sales"] as QueryKey, ...base };',
      "export const useTicket = () => useReceipt(options);",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-queries.ts:5 roots a query key at "ticket", but the concept folder holding it is "sales"',
  ]);
});

test("follows the earlier keys of an object only while a later spread may leave the key out", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      IMPORTS,
      "export function useReceipt(props: { key: QueryKey }) {",
      "  return useQuery({ queryKey: props.key, queryFn: () => [] });",
      "}",
      'const defaults = { key: ["ticket"] as QueryKey };',
      'const draftDefaults = { key: ["drafts"] as QueryKey };',
      'const lineDefaults = { key: ["lines"] as QueryKey };',
      "const overrides: { key?: QueryKey } = {};",
      'const required = { key: ["sales"] as QueryKey };',
      "const draftOptions = { ...draftDefaults, ...overrides };",
      "export const useTicket = () => useReceipt({ ...defaults, ...overrides });",
      "export const useDraft = () => useReceipt(draftOptions);",
      "export const useLines = () => useReceipt({ ...lineDefaults, ...required });",
      'const receiptDefaults = { key: ["receipts"] as QueryKey };',
      'export const useSales = () => useReceipt({ ...receiptDefaults, key: ["sales"] });',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-queries.ts:5 roots a query key at "ticket", but the concept folder holding it is "sales"',
    'src/sales/sales-queries.ts:6 roots a query key at "drafts", but the concept folder holding it is "sales"',
  ]);
});

test("follows the earlier keys of an object past a spread of an object that may be absent", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      IMPORTS,
      "export function useReceipt(props: { key: QueryKey }) {",
      "  return useQuery({ queryKey: props.key, queryFn: () => [] });",
      "}",
      'const defaults = { key: ["ticket"] as QueryKey };',
      'const draftDefaults = { key: ["drafts"] as QueryKey };',
      "export const useTicket = (overrides?: { key: QueryKey }) => useReceipt({ ...defaults, ...overrides });",
      "export function useDraft(overrides?: { key: QueryKey }) {",
      "  const options = { ...draftDefaults, ...overrides };",
      "  return useReceipt(options);",
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-queries.ts:5 roots a query key at "ticket", but the concept folder holding it is "sales"',
    'src/sales/sales-queries.ts:6 roots a query key at "drafts", but the concept folder holding it is "sales"',
  ]);
});

test("follows a key from a spread given only when a condition holds, and the keys it may leave in place", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      IMPORTS,
      "export function useReceipt(props: { key: QueryKey }) {",
      "  return useQuery({ queryKey: props.key, queryFn: () => [] });",
      "}",
      'const ticketOverride = { key: ["receipts"] as QueryKey };',
      'const draftOverride = { key: ["drafts"] as QueryKey };',
      'const defaults = { key: ["ticket"] as QueryKey };',
      "export const useTicket = (isTicket: boolean) =>",
      '  useReceipt({ key: ["sales"], ...(isTicket && ticketOverride) });',
      "export const useDraft = (isTicket: boolean) =>",
      "  useReceipt({ ...defaults, ...(isTicket && draftOverride) });",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-queries.ts:5 roots a query key at "receipts", but the concept folder holding it is "sales"',
    'src/sales/sales-queries.ts:6 roots a query key at "drafts", but the concept folder holding it is "sales"',
    'src/sales/sales-queries.ts:7 roots a query key at "ticket", but the concept folder holding it is "sales"',
  ]);
});

test("follows both sides of a key chosen by a fallback", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      IMPORTS,
      "export function useReceipt(props: { key: QueryKey }) {",
      "  return useQuery({ queryKey: props.key, queryFn: () => [] });",
      "}",
      'const ticketDefaults = { key: ["ticket"] as QueryKey };',
      'const draftDefaults = { key: ["drafts"] as QueryKey };',
      "let lastTicketView: { key: QueryKey } | undefined;",
      "export const useTicket = () => useReceipt({ ...(lastTicketView ?? ticketDefaults) });",
      "export const useDraft = (overrides?: { key: QueryKey }) => useReceipt({ ...(overrides || draftDefaults) });",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-queries.ts:5 roots a query key at "ticket", but the concept folder holding it is "sales"',
    'src/sales/sales-queries.ts:6 roots a query key at "drafts", but the concept folder holding it is "sales"',
    "src/sales/sales-queries.ts:8 uses a query key whose root the check cannot read",
  ]);
});

test("follows a key forwarded through the rest of a destructured parameter spread into a component", (t) => {
  const problems = problemsIn(t, {
    "src/sales/ticket-panel.tsx": [
      IMPORTS,
      "function Panel({ source }: { source: QueryKey }) {",
      "  useQuery({ queryKey: source, queryFn: () => [] });",
      "  return null;",
      "}",
      "function Wrap({ title, ...rest }: { title: string; source: QueryKey }) {",
      "  return <Panel {...rest} />;",
      "}",
      'export const salesPanel = <Wrap title="Ventas" source={["sales"]} />;',
      'export const receiptPanel = <Wrap title="Recibos" source={["receipts"]} />;',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/ticket-panel.tsx:10 roots a query key at "receipts", but the concept folder holding it is "sales"',
  ]);
});

test("follows a key read back through query options held in an object or chosen by a condition", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      'import { QueryClient, queryOptions } from "@tanstack/react-query";',
      'const ticketOptions = queryOptions({ queryKey: ["sales", "ticket"], queryFn: () => [] });',
      'const openOptions = queryOptions({ queryKey: ["sales", "open"], queryFn: () => [] });',
      'const closedOptions = queryOptions({ queryKey: ["sales", "closed"], queryFn: () => [] });',
      "const salesQueries = {",
      '  lines: queryOptions({ queryKey: ["sales", "lines"], queryFn: () => [] }),',
      "  ticketOptions,",
      "};",
      "export function refresh(client: QueryClient, open: boolean) {",
      "  client.invalidateQueries({ queryKey: salesQueries.lines.queryKey });",
      "  client.invalidateQueries({ queryKey: salesQueries.ticketOptions.queryKey });",
      "  client.invalidateQueries({ queryKey: (open ? openOptions : closedOptions).queryKey });",
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, []);
});

test("follows an argument object held in another object or chosen by a condition", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      IMPORTS,
      "export function useReceipt(props: { key: QueryKey }) {",
      "  return useQuery({ queryKey: props.key, queryFn: () => [] });",
      "}",
      'const ticketQuery = { key: ["tickets"] };',
      'const draftQuery = { key: ["drafts"] };',
      'const lineQuery = { key: ["lines"] };',
      'const salesQueries = { receipt: { key: ["receipts"] }, ticketQuery };',
      "export const useReceipts = () => useReceipt(salesQueries.receipt);",
      "export const useTickets = () => useReceipt(salesQueries.ticketQuery);",
      "export const useDrafts = (open: boolean) => useReceipt(open ? draftQuery : lineQuery);",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    'src/sales/sales-queries.ts:5 roots a query key at "tickets", but the concept folder holding it is "sales"',
    'src/sales/sales-queries.ts:6 roots a query key at "drafts", but the concept folder holding it is "sales"',
    'src/sales/sales-queries.ts:7 roots a query key at "lines", but the concept folder holding it is "sales"',
    'src/sales/sales-queries.ts:8 roots a query key at "receipts", but the concept folder holding it is "sales"',
  ]);
});

test("refuses a root written as a template literal as unreadable", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      IMPORTS,
      "export const useReceipts = () => useQuery({ queryKey: [`receipts`], queryFn: () => [] });",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/sales-queries.ts:2 uses a query key whose root the check cannot read",
  ]);
});

test("refuses a key read from a constructor's parameter, whose arguments it does not check", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-refresh.ts": [
      IMPORTS,
      "const client = new QueryClient();",
      "class Refresher {",
      "  constructor(key: QueryKey) {",
      "    client.invalidateQueries({ queryKey: key });",
      "  }",
      "}",
      'export const refresher = new Refresher(["receipts"]);',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/sales-refresh.ts:5 uses a query key whose root the check cannot read",
  ]);
});

test("refuses a key read from a parameter typed as a query key joined with another type or in parentheses", (t) => {
  const problems = problemsIn(t, {
    "src/sales/sales-queries.ts": [
      IMPORTS,
      "type Tagged = { readonly tag?: string };",
      "export function useTagged(key: QueryKey & Tagged) {",
      "  return useQuery({ queryKey: key, queryFn: () => [] });",
      "}",
      "export function useWrapped(key: (QueryKey)) {",
      "  return useQuery({ queryKey: key, queryFn: () => [] });",
      "}",
      'export const useReceipts = () => useTagged(["receipts"]);',
      'export const useTickets = () => useWrapped(["tickets"]);',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/sales-queries.ts:4 uses a query key whose root the check cannot read",
    "src/sales/sales-queries.ts:7 uses a query key whose root the check cannot read",
  ]);
});

test("refuses a key read from a prop named queryKey that is not typed as a query key, whose attribute it does not check", (t) => {
  const problems = problemsIn(t, {
    "src/sales/ticket-panel.tsx": [
      IMPORTS,
      "function Panel({ queryKey }: { queryKey: readonly unknown[] }) {",
      "  useQuery({ queryKey, queryFn: () => [] });",
      "  return null;",
      "}",
      'export const receiptPanel = <Panel queryKey={["receipts"]} />;',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/sales/ticket-panel.tsx:3 uses a query key whose root the check cannot read",
  ]);
});

test("every query key in the backoffice and the register's screens is rooted at its concept folder", () => {
  for (const source of QUERY_KEY_SOURCES) {
    assert.deepEqual(findQueryRootKeyProblems(source, repoRoot), [], source.sourceRoot);
  }
});
