import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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
    "  fetchQuery<TQueryKey extends QueryKey>(options: QueryOptions<TQueryKey>): Promise<unknown>;",
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

export const TSCONFIG = JSON.stringify({
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

export const IMPORTS =
  'import { QueryClient, useQuery, type QueryKey } from "@tanstack/react-query";';

export function projectWith(t, files) {
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
  return root;
}
