import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { findQueriesFileProblems, QUERY_KEY_SOURCES } from "./query-root-keys.mjs";
import { IMPORTS, projectWith } from "./test-support/query-root-keys.mjs";

const repoRoot = join(dirname(new URL(import.meta.url).pathname), "../..");

function problemsIn(t, files) {
  return findQueriesFileProblems(
    { tsconfig: "tsconfig.json", sourceRoot: "src", foldersOutsideConcepts: ["platform", "shell"] },
    projectWith(t, {
      "src/platform/use-cloud-query.ts": [
        IMPORTS,
        "type CloudQuery = { queryKey: QueryKey; read: () => unknown };",
        "export function cloudQueryOptions({ queryKey, read }: CloudQuery) {",
        "  return { queryKey, queryFn: read };",
        "}",
        "export function fetchCloudQuery(client: QueryClient, query: CloudQuery) {",
        "  return client.fetchQuery(cloudQueryOptions(query));",
        "}",
        "export function useCloudQuery(query: CloudQuery) {",
        "  return useQuery(cloudQueryOptions(query));",
        "}",
        "export function useCachedOnly({ queryKey }: CloudQuery) {",
        "  return fetchCloudQuery(new QueryClient(), { queryKey, read: () => [] });",
        "}",
        "export function setAnswer(client: QueryClient, queryKey: QueryKey, answer: unknown) {",
        "  client.setQueryData(queryKey, answer);",
        "}",
      ].join("\n"),
      "src/shell/placeholder.ts": "export {};",
      ...files,
    }),
  );
}

const PRICING_QUERIES = [
  IMPORTS,
  'import { useCloudQuery } from "../platform/use-cloud-query";',
  'export const pricingKey = ["pricing"] as const;',
  "export const pricingKeys = {",
  '  list: (search: string) => [...pricingKey, "list", search] as const,',
  "};",
  "export const usePrices = (search: string) =>",
  "  useCloudQuery({ queryKey: pricingKeys.list(search), read: () => [] });",
].join("\n");

test("accepts a concept's keys and query hooks in its queries file, used and invalidated from its screens and the shell", (t) => {
  const problems = problemsIn(t, {
    "src/pricing/pricing-queries.ts": PRICING_QUERIES,
    "src/pricing/prices-screen.ts": [
      IMPORTS,
      'import { setAnswer } from "../platform/use-cloud-query";',
      'import { pricingKey, pricingKeys, usePrices } from "./pricing-queries";',
      "export function PricesScreen(client: QueryClient) {",
      '  const prices = usePrices("");',
      "  client.invalidateQueries({ queryKey: pricingKey });",
      '  setAnswer(client, pricingKeys.list(""), prices);',
      "}",
    ].join("\n"),
    "src/shell/app.ts": [
      IMPORTS,
      'import { pricingKey } from "../pricing/pricing-queries";',
      "export const refresh = (client: QueryClient) => client.invalidateQueries({ queryKey: pricingKey });",
    ].join("\n"),
  });

  assert.deepEqual(problems, []);
});

test("refuses a second queries file in a concept folder, and one named for the concept away from the folder's top", (t) => {
  const problems = problemsIn(t, {
    "src/access/access-queries.ts": 'export const accessKey = ["access"] as const;',
    "src/access/authorizers-queries.ts": "export const authorizers = 1;",
    "src/access/roles/access-queries.ts": "export const roles = 1;",
  });

  assert.deepEqual(problems, [
    "src/access/authorizers-queries.ts is a queries file other than src/access/access-queries.ts",
    "src/access/roles/access-queries.ts is a queries file other than src/access/access-queries.ts",
  ]);
});

test("refuses a key declared in another file of the concept folder, naming where it must live", (t) => {
  const problems = problemsIn(t, {
    "src/pricing/pricing-queries.ts": PRICING_QUERIES,
    "src/pricing/prices-screen.ts": [
      IMPORTS,
      'import { pricingKey } from "./pricing-queries";',
      'const reviewKey = ["pricing", "review"] as const;',
      'const searchKey = (search: string) => [...pricingKey, "search", search] as const;',
      "export function refresh(client: QueryClient) {",
      "  client.invalidateQueries({ queryKey: reviewKey });",
      '  client.setQueryData(searchKey("milk"), []);',
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/pricing/prices-screen.ts:3 declares a query key outside src/pricing/pricing-queries.ts",
    "src/pricing/prices-screen.ts:4 declares a query key outside src/pricing/pricing-queries.ts",
  ]);
});

test("refuses a key extended outside every concept folder", (t) => {
  const problems = problemsIn(t, {
    "src/pricing/pricing-queries.ts": PRICING_QUERIES,
    "src/shell/app.ts": [
      IMPORTS,
      'import { pricingKey } from "../pricing/pricing-queries";',
      'export const refresh = (client: QueryClient) => client.invalidateQueries({ queryKey: [...pricingKey, "list"] });',
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/shell/app.ts:3 declares a query key outside a concept's queries file",
  ]);
});

test("refuses a query read in another file of the concept folder, directly or through a reading helper", (t) => {
  const problems = problemsIn(t, {
    "src/pricing/pricing-queries.ts": PRICING_QUERIES,
    "src/pricing/prices-screen.ts": [
      IMPORTS,
      'import { queryOptions } from "@tanstack/react-query";',
      'import { fetchCloudQuery, useCachedOnly, useCloudQuery } from "../platform/use-cloud-query";',
      'import { pricingKey, pricingKeys } from "./pricing-queries";',
      "export function PricesScreen(client: QueryClient) {",
      "  useQuery({ queryKey: pricingKey, queryFn: () => [] });",
      "  queryOptions({ queryKey: pricingKey, queryFn: () => [] });",
      "  client.fetchQuery({ queryKey: pricingKey, queryFn: () => [] });",
      '  useCloudQuery({ queryKey: pricingKeys.list(""), read: () => [] });',
      "  fetchCloudQuery(client, { queryKey: pricingKey, read: () => [] });",
      "  useCachedOnly({ queryKey: pricingKey, read: () => [] });",
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/pricing/prices-screen.ts:6 reads a query outside src/pricing/pricing-queries.ts",
    "src/pricing/prices-screen.ts:7 reads a query outside src/pricing/pricing-queries.ts",
    "src/pricing/prices-screen.ts:8 reads a query outside src/pricing/pricing-queries.ts",
    "src/pricing/prices-screen.ts:9 reads a query outside src/pricing/pricing-queries.ts",
    "src/pricing/prices-screen.ts:10 reads a query outside src/pricing/pricing-queries.ts",
    "src/pricing/prices-screen.ts:11 reads a query outside src/pricing/pricing-queries.ts",
  ]);
});

test("refuses a query read through a renamed import, a namespace import, a re-export or a constant holding the reader", (t) => {
  const problems = problemsIn(t, {
    "src/pricing/pricing-queries.ts": PRICING_QUERIES,
    "src/platform/reads.ts": [
      'export { useQuery as useRead } from "@tanstack/react-query";',
      'export * from "./use-cloud-query";',
    ].join("\n"),
    "src/pricing/prices-screen.ts": [
      'import { useQuery as useTanstackQuery } from "@tanstack/react-query";',
      'import * as query from "@tanstack/react-query";',
      'import * as reads from "../platform/reads";',
      'import { useRead, useCloudQuery as useCloud } from "../platform/reads";',
      'import { pricingKey } from "./pricing-queries";',
      "const readPrices = reads.useCloudQuery;",
      "export function PricesScreen() {",
      "  useTanstackQuery({ queryKey: pricingKey, queryFn: () => [] });",
      "  query.useQuery({ queryKey: pricingKey, queryFn: () => [] });",
      "  useRead({ queryKey: pricingKey, queryFn: () => [] });",
      "  useCloud({ queryKey: pricingKey, read: () => [] });",
      "  readPrices({ queryKey: pricingKey, read: () => [] });",
      "}",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/pricing/prices-screen.ts:8 reads a query outside src/pricing/pricing-queries.ts",
    "src/pricing/prices-screen.ts:9 reads a query outside src/pricing/pricing-queries.ts",
    "src/pricing/prices-screen.ts:10 reads a query outside src/pricing/pricing-queries.ts",
    "src/pricing/prices-screen.ts:11 reads a query outside src/pricing/pricing-queries.ts",
    "src/pricing/prices-screen.ts:12 reads a query outside src/pricing/pricing-queries.ts",
  ]);
});

test("refuses a reading helper of a concept folder called from its screens, though not the helper itself", (t) => {
  const problems = problemsIn(t, {
    "src/pricing/pricing-queries.ts": PRICING_QUERIES,
    "src/pricing/read-prices.ts": [
      IMPORTS,
      'import { useCloudQuery } from "../platform/use-cloud-query";',
      "export const readPrices = (queryKey: QueryKey) => useCloudQuery({ queryKey, read: () => [] });",
    ].join("\n"),
    "src/pricing/prices-screen.ts": [
      'import { readPrices } from "./read-prices";',
      'import { pricingKey } from "./pricing-queries";',
      "export const PricesScreen = () => readPrices(pricingKey);",
    ].join("\n"),
  });

  assert.deepEqual(problems, [
    "src/pricing/prices-screen.ts:3 reads a query outside src/pricing/pricing-queries.ts",
  ]);
});

test("leaves out test files, which read and seed queries to prove a screen", (t) => {
  const problems = problemsIn(t, {
    "src/pricing/pricing-queries.ts": PRICING_QUERIES,
    "src/pricing/prices-screen.test.ts": [
      IMPORTS,
      'useQuery({ queryKey: ["pricing", "list"], queryFn: () => [] });',
    ].join("\n"),
  });

  assert.deepEqual(problems, []);
});

test("every concept's query keys and query reads in the backoffice and the register's screens live in its queries file", () => {
  for (const source of QUERY_KEY_SOURCES) {
    assert.deepEqual(findQueriesFileProblems(source, repoRoot), [], source.sourceRoot);
  }
});
