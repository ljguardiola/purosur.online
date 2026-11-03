import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFiles, runCli } from "./table-columns-memoized-check.mjs";

const MEMOIZED_COLUMNS = [
  'import { useState } from "react";',
  'import { dataColumn, useTableModel } from "@purosur/ui";',
  'import { useRowsQuery } from "./rows";',
  "",
  "const NO_ROWS = [];",
  "",
  "export function Rows() {",
  "  const query = useRowsQuery();",
  "  const [suffix] = useState(0);",
  '  const columns = [dataColumn({ id: "name", header: "Name", render: (item) => item.name + suffix })];',
  "  const table = useTableModel({ items: query.data ?? NO_ROWS, id: (item) => item.id, columns });",
  "",
  "  return <span>{table.rows.length}</span>;",
  "}",
  "",
].join("\n");

const COLUMNS_THE_COMPILER_SKIPPED = [
  'import { useRef, useState } from "react";',
  'import { dataColumn, useTableModel } from "@purosur/ui";',
  'import { useRowsQuery } from "./rows";',
  "",
  "export function Rows() {",
  "  const ref = useRef(0);",
  "  const query = useRowsQuery();",
  "  const [open, setOpen] = useState(false);",
  "",
  "  function openRow(id) {",
  "    ref.current = id;",
  "    setOpen(true);",
  "  }",
  "",
  '  const columns = [dataColumn({ id: "name", header: "Name", render: (item) => item.name, onClick: openRow })];',
  "  const table = useTableModel({ items: query.data ?? [], id: (item) => item.id, columns });",
  "",
  "  return <span>{table.rows.length}{open}</span>;",
  "}",
  "",
].join("\n");

const OPTIONS_FROM_A_FRESH_COMBINATION = [
  'import { dataColumn, useTableModel } from "@purosur/ui";',
  'import { combine, useExtraQuery, useRowsQuery } from "./rows";',
  "",
  "const NOTHING = [[], []];",
  "",
  "export function Rows() {",
  "  const data = combine(useRowsQuery(), useExtraQuery());",
  '  const [rows, extra] = data.status === "loaded" ? data.value : NOTHING;',
  "  const table = useTableModel({",
  "    items: rows,",
  "    id: (item) => item.id,",
  "    columns: columnsFor(extra.length),",
  "  });",
  "",
  "  return <span>{table.rows.length}</span>;",
  "}",
  "",
  "function columnsFor(count) {",
  '  return [dataColumn({ id: "name", header: "Name", render: (item) => item.name + count })];',
  "}",
  "",
].join("\n");

const COLUMNS_FROM_A_DECLARATION_IN_THE_COMPONENT = [
  'import { useState } from "react";',
  'import { dataColumn, useTableModel } from "@purosur/ui";',
  "",
  "export function Rows({ rows }) {",
  "  const [suffix] = useState(0);",
  "  const table = useTableModel({ items: rows, id: (item) => item.id, columns: build(suffix) });",
  "",
  "  function build(extra) {",
  '    return [dataColumn({ id: "name", header: "Name", render: (item) => item.name + extra })];',
  "  }",
  "",
  "  return <span>{table.rows.length}</span>;",
  "}",
  "",
].join("\n");

const ITEMS_AS_OPTIONAL_MEMBER_OF_A_HOOK_RESULT = [
  'import { dataColumn, useTableModel } from "@purosur/ui";',
  'import { useRowsQuery } from "./rows";',
  "",
  'const COLUMNS = [dataColumn({ id: "name", header: "Name", render: (item) => item.name })];',
  "",
  "export function Rows() {",
  "  const query = useRowsQuery();",
  "  const table = useTableModel({ items: query.data?.rows, id: (item) => item.id, columns: COLUMNS });",
  "",
  "  return <span>{table.rows.length}</span>;",
  "}",
  "",
].join("\n");

const OPTIONS_FROM_PROPS = [
  'import { useTableModel } from "@purosur/ui";',
  "",
  "export function Rows({ rows, columns }) {",
  "  const table = useTableModel({ items: rows, id: (item) => item.id, columns });",
  "",
  "  return <span>{table.rows.length}</span>;",
  "}",
  "",
].join("\n");

const OPTIONS_SPREAD_FROM_PROPS = [
  'import { useTableModel } from "@purosur/ui";',
  "",
  "export function Rows({ rows, options }) {",
  "  const table = useTableModel({ ...options, items: rows });",
  "",
  "  return <span>{table.rows.length}</span>;",
  "}",
  "",
].join("\n");

const OPTIONS_FROM_A_CALL = [
  'import { useTableModel } from "@purosur/ui";',
  "",
  "export function Rows({ rows }) {",
  "  const table = useTableModel(optionsFor(rows));",
  "",
  "  return <span>{table.rows.length}</span>;",
  "}",
  "",
  "function optionsFor(rows) {",
  "  return { items: rows, id: (item) => item.id, columns: [] };",
  "}",
  "",
].join("\n");

const ITEMS_FROM_A_PRIMITIVE_CALCULATION = [
  'import { useTableModel } from "@purosur/ui";',
  'import { useRowsQuery } from "./rows";',
  "",
  "export function Rows({ columns }) {",
  "  const query = useRowsQuery();",
  "  const lastPage = query.data ? Math.max(1, Math.ceil(query.data.total / 20)) : undefined;",
  "  const rows = lastPage === undefined ? query.data : query.data.slice(0, lastPage);",
  "  const table = useTableModel({ items: rows, id: (item) => item.id, columns });",
  "",
  "  return <span>{table.rows.length}</span>;",
  "}",
  "",
].join("\n");

const TABLE_MODEL_IN_A_RENDER_HOOK_CALLBACK = [
  'import { renderHook } from "@testing-library/react";',
  'import { useTableModel } from "@purosur/ui";',
  "",
  "export function rendersWith(columns) {",
  "  return renderHook(() => useTableModel({ items: [], id: (item) => item.id, columns }));",
  "}",
  "",
].join("\n");

test("memoized columns and items report nothing", async () => {
  const violations = await checkFiles([{ path: "rows.tsx", source: MEMOIZED_COLUMNS }]);

  assert.deepEqual(violations, []);
});

test("items read as an optional member of a hook result report nothing", async () => {
  const violations = await checkFiles([
    { path: "rows.tsx", source: ITEMS_AS_OPTIONAL_MEMBER_OF_A_HOOK_RESULT },
  ]);

  assert.deepEqual(violations, []);
});

test("options taken from props report nothing", async () => {
  const violations = await checkFiles([{ path: "rows.tsx", source: OPTIONS_FROM_PROPS }]);

  assert.deepEqual(violations, []);
});

test("items derived through primitive calculations report nothing", async () => {
  const violations = await checkFiles([
    { path: "rows.tsx", source: ITEMS_FROM_A_PRIMITIVE_CALCULATION },
  ]);

  assert.deepEqual(violations, []);
});

test("a table model built in a callback that is not a component or hook reports nothing", async () => {
  const violations = await checkFiles([
    { path: "rows.test.tsx", source: TABLE_MODEL_IN_A_RENDER_HOOK_CALLBACK },
  ]);

  assert.deepEqual(violations, []);
});

test("a file without useTableModel reports nothing", async () => {
  const violations = await checkFiles([
    { path: "plain.tsx", source: "export function Plain() { return <span />; }\n" },
  ]);

  assert.deepEqual(violations, []);
});

test("columns built in a component the compiler skipped are reported", async () => {
  const violations = await checkFiles([{ path: "rows.tsx", source: COLUMNS_THE_COMPILER_SKIPPED }]);
  const columns = violations.find((violation) =>
    violation.reason.includes("useTableModel columns"),
  );

  assert.ok(columns);
  assert.equal(columns.path, "rows.tsx");
  assert.match(columns.reason, /^useTableModel columns is not memoized by the React Compiler \(/);
});

test("items chosen against a fallback literal in a component the compiler skipped are reported", async () => {
  const violations = await checkFiles([{ path: "rows.tsx", source: COLUMNS_THE_COMPILER_SKIPPED }]);
  const items = violations.find((violation) => violation.reason.includes("useTableModel items"));

  assert.ok(items);
  assert.match(items.reason, /^useTableModel items is not memoized by the React Compiler \(/);
});

test("a violation is reported on the line of the useTableModel call", async () => {
  const violations = await checkFiles([{ path: "rows.tsx", source: COLUMNS_THE_COMPILER_SKIPPED }]);

  assert.ok(violations.length > 0);
  for (const violation of violations) assert.equal(violation.line, 16);
});

test("options derived from a call that mixes hook results are reported for columns and items", async () => {
  const violations = await checkFiles([
    { path: "rows.tsx", source: OPTIONS_FROM_A_FRESH_COMBINATION },
  ]);

  assert.equal(violations.length, 2);
  assert.match(violations[0].reason, /^useTableModel columns is not memoized/);
  assert.match(violations[0].reason, /columnsFor\(/);
  assert.match(violations[1].reason, /^useTableModel items is not memoized/);
});

test("columns built by a function declared inside the component are reported", async () => {
  const violations = await checkFiles([
    { path: "rows.tsx", source: COLUMNS_FROM_A_DECLARATION_IN_THE_COMPONENT },
  ]);

  assert.equal(violations.length, 1);
  assert.match(violations[0].reason, /^useTableModel columns is not memoized/);
  assert.match(violations[0].reason, /build\(/);
});

test("options spread from another object cannot be followed and are reported", async () => {
  const violations = await checkFiles([{ path: "rows.tsx", source: OPTIONS_SPREAD_FROM_PROPS }]);

  assert.equal(violations.length, 1);
  assert.match(violations[0].reason, /^useTableModel columns /);
  assert.match(violations[0].reason, /cannot be followed/);
});

test("options built by a call cannot be followed and are reported", async () => {
  const violations = await checkFiles([{ path: "rows.tsx", source: OPTIONS_FROM_A_CALL }]);

  assert.equal(violations.length, 1);
  assert.match(violations[0].reason, /cannot be followed/);
});

test("runCli reports nothing and exits 0 when every table is memoized", async () => {
  const errors = [];
  const exitCode = await runCli({
    findFiles: () => ["rows.tsx"],
    readFile: () => MEMOIZED_COLUMNS,
    logError: (line) => errors.push(line),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(errors, []);
});

test("runCli prints every violation and exits 1 when a table is not memoized", async () => {
  const errors = [];
  const exitCode = await runCli({
    findFiles: () => ["rows.tsx"],
    readFile: () => OPTIONS_FROM_A_FRESH_COMBINATION,
    logError: (line) => errors.push(line),
  });

  assert.equal(exitCode, 1);
  assert.ok(errors.some((line) => line.startsWith("rows.tsx:9: useTableModel columns")));
  assert.ok(errors.some((line) => line.startsWith("rows.tsx:9: useTableModel items")));
});

const HOOK_WITH_COLUMNS_THE_COMPILER_SKIPPED = [
  'import { useRef, useState } from "react";',
  'import { dataColumn } from "@purosur/ui";',
  "",
  "export function useRowColumns() {",
  "  const ref = useRef(0);",
  "  const [, setOpen] = useState(false);",
  "",
  "  function openRow(id) {",
  "    ref.current = id;",
  "    setOpen(true);",
  "  }",
  "",
  '  return [dataColumn({ id: "name", header: "Name", render: (item) => item.name, onClick: openRow })];',
  "}",
  "",
].join("\n");

const HOOK_WITH_MEMOIZED_COLUMNS = [
  'import { useState } from "react";',
  'import { dataColumn } from "@purosur/ui";',
  "",
  "export function useRowColumns() {",
  "  const [suffix] = useState(0);",
  '  return [dataColumn({ id: "name", header: "Name", render: (item) => item.name + suffix })];',
  "}",
  "",
].join("\n");

const HOOK_WITH_COLUMNS_ON_A_HANDLER = [
  'import { useState } from "react";',
  'import { dataColumn } from "@purosur/ui";',
  "",
  "export function useRowColumns(onOpen) {",
  "  const [suffix] = useState(0);",
  '  return [dataColumn({ id: "name", header: "Name", render: (item) => item.name + suffix, onClick: onOpen })];',
  "}",
  "",
].join("\n");

const ROWS_FROM_A_COLUMNS_HOOK = [
  'import { useTableModel } from "@purosur/ui";',
  'import { useRowColumns } from "./row-columns";',
  "",
  "const NO_ROWS = [];",
  "",
  "export function Rows() {",
  "  const columns = useRowColumns();",
  "  const table = useTableModel({ items: NO_ROWS, id: (item) => item.id, columns });",
  "",
  "  return <span>{table.rows.length}</span>;",
  "}",
  "",
].join("\n");

const ROWS_PASSING_A_HANDLER_TO_A_COLUMNS_HOOK = (handler) =>
  [
    'import { useState } from "react";',
    'import { useTableModel } from "@purosur/ui";',
    'import { useRowColumns } from "./row-columns";',
    "",
    "const NO_ROWS = [];",
    "",
    "function openNothing() {}",
    "",
    "export function Rows() {",
    "  const [open, setOpen] = useState(0);",
    "",
    "  function openRow(id) {",
    "    select(id);",
    "  }",
    "",
    `  const columns = useRowColumns(${handler});`,
    "  const table = useTableModel({ items: NO_ROWS, id: (item) => item.id, columns });",
    "",
    "  function select(id) {",
    "    setOpen(id);",
    "  }",
    "",
    "  return <span>{table.rows.length}{open}</span>;",
    "}",
    "",
  ].join("\n");

const TABLE_PART_WITH_COLUMNS_ON_A_HANDLER_PROP = [
  'import { dataColumn, useTableModel } from "@purosur/ui";',
  "",
  "export function RowsTable({ rows, onOpen }) {",
  '  const columns = [dataColumn({ id: "name", header: "Name", render: (item) => item.name, onClick: onOpen })];',
  "  const table = useTableModel({ items: rows, id: (item) => item.id, columns });",
  "",
  "  return <span>{table.rows.length}</span>;",
  "}",
  "",
].join("\n");

const SCREEN_THE_COMPILER_SKIPPED_PASSING = (attributes) =>
  [
    'import { useState } from "react";',
    'import { RowsTable } from "./rows-table";',
    "",
    "const NO_ROWS = [];",
    "",
    "function openNothing() {}",
    "",
    "export function RowsScreen() {",
    "  const [open, setOpen] = useState(0);",
    "",
    "  function openRow(id) {",
    "    select(id);",
    "  }",
    "",
    `  const table = <RowsTable rows={NO_ROWS} ${attributes} />;`,
    "",
    "  function select(id) {",
    "    setOpen(id);",
    "  }",
    "",
    "  return <div>{open}{table}</div>;",
    "}",
    "",
  ].join("\n");

const SCREEN_PASSING_A_HANDLER_IT_DECLARES = [
  'import { useState } from "react";',
  'import { RowsTable } from "./rows-table";',
  "",
  "const NO_ROWS = [];",
  "",
  "export function RowsScreen() {",
  "  const [open, setOpen] = useState(0);",
  "  const openRow = (id) => setOpen(id);",
  "",
  "  return <div>{open}<RowsTable rows={NO_ROWS} onOpen={openRow} /></div>;",
  "}",
  "",
].join("\n");

const SECTION_PASSING_ITS_OWN_PROP = [
  'import { RowsTable } from "./rows-table";',
  "",
  "const NO_ROWS = [];",
  "",
  "export function RowsSection({ onOpen }) {",
  "  return <section><RowsTable rows={NO_ROWS} onOpen={onOpen} /></section>;",
  "}",
  "",
].join("\n");

const SCREEN_RENDERING_THE_SECTION_WITH_A_HANDLER_THE_COMPILER_SKIPPED = [
  'import { useState } from "react";',
  'import { RowsSection } from "./rows-section";',
  "",
  "export function RowsScreen() {",
  "  const [open, setOpen] = useState(0);",
  "",
  "  function openRow(id) {",
  "    select(id);",
  "  }",
  "",
  "  const section = <RowsSection onOpen={openRow} />;",
  "",
  "  function select(id) {",
  "    setOpen(id);",
  "  }",
  "",
  "  return <div>{open}{section}</div>;",
  "}",
  "",
].join("\n");

const SCREEN_RENDERING_THE_SECTION_WITH_A_MEMOIZED_HANDLER = [
  'import { useState } from "react";',
  'import { RowsSection } from "./rows-section";',
  "",
  "export function RowsScreen() {",
  "  const [open, setOpen] = useState(0);",
  "  const openRow = (id) => setOpen(id);",
  "",
  "  return <div>{open}<RowsSection onOpen={openRow} /></div>;",
  "}",
  "",
].join("\n");

test("columns returned unmemoized by a hook imported from another file are reported at the table", async () => {
  const violations = await checkFiles([
    { path: "rows.tsx", source: ROWS_FROM_A_COLUMNS_HOOK },
    { path: "row-columns.ts", source: HOOK_WITH_COLUMNS_THE_COMPILER_SKIPPED },
  ]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "rows.tsx");
  assert.equal(violations[0].line, 8);
  assert.match(violations[0].reason, /^useTableModel columns is not memoized/);
  assert.match(violations[0].reason, /useRowColumns\(…\)/);
});

test("columns returned unmemoized by a hook declared in the same file are reported", async () => {
  const source = ROWS_FROM_A_COLUMNS_HOOK.replace(
    'import { useRowColumns } from "./row-columns";\n',
    "",
  ).concat(HOOK_WITH_COLUMNS_THE_COMPILER_SKIPPED.replace(/^import .*\n/gm, ""));
  const violations = await checkFiles([
    { path: "rows.tsx", source: `import { useRef, useState } from "react";\n${source}` },
  ]);

  assert.equal(violations.length, 1);
  assert.match(violations[0].reason, /^useTableModel columns is not memoized/);
});

test("columns returned by a hook reached through a workspace package's re-export are reported", async () => {
  const violations = await checkFiles(
    [
      {
        path: "apps/backoffice/src/rows.tsx",
        source: ROWS_FROM_A_COLUMNS_HOOK.replace('"./row-columns"', '"@purosur/ui"'),
      },
      { path: "packages/ui/src/index.ts", source: 'export * from "./row-columns";\n' },
      { path: "packages/ui/src/row-columns.ts", source: HOOK_WITH_COLUMNS_THE_COMPILER_SKIPPED },
    ],
    { packages: { "@purosur/ui": "packages/ui/src/index.ts" } },
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "apps/backoffice/src/rows.tsx");
});

test("columns a hook returns memoized report nothing", async () => {
  const violations = await checkFiles([
    { path: "rows.tsx", source: ROWS_FROM_A_COLUMNS_HOOK },
    { path: "row-columns.ts", source: HOOK_WITH_MEMOIZED_COLUMNS },
  ]);

  assert.deepEqual(violations, []);
});

test("a handler the compiler left unmemoized, passed to a hook that builds the columns on it, is reported", async () => {
  const violations = await checkFiles([
    { path: "rows.tsx", source: ROWS_PASSING_A_HANDLER_TO_A_COLUMNS_HOOK("openRow") },
    { path: "row-columns.ts", source: HOOK_WITH_COLUMNS_ON_A_HANDLER },
  ]);

  assert.equal(violations.length, 1);
  assert.match(violations[0].reason, /^useTableModel columns is not memoized/);
  assert.match(violations[0].reason, /useRowColumns argument 1 <- openRow/);
});

test("a module function passed to a hook that builds the columns on it reports nothing", async () => {
  const violations = await checkFiles([
    { path: "rows.tsx", source: ROWS_PASSING_A_HANDLER_TO_A_COLUMNS_HOOK("openNothing") },
    { path: "row-columns.ts", source: HOOK_WITH_COLUMNS_ON_A_HANDLER },
  ]);

  assert.deepEqual(violations, []);
});

test("a handler the compiler left unmemoized, passed to a table part that builds its columns on it, is reported where it is passed", async () => {
  const violations = await checkFiles([
    { path: "rows-screen.tsx", source: SCREEN_THE_COMPILER_SKIPPED_PASSING("onOpen={openRow}") },
    { path: "rows-table.tsx", source: TABLE_PART_WITH_COLUMNS_ON_A_HANDLER_PROP },
  ]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "rows-screen.tsx");
  assert.equal(violations[0].line, 15);
  assert.match(
    violations[0].reason,
    /^useTableModel columns of rows-table\.tsx:5 is not memoized by the React Compiler \(/,
  );
  assert.match(violations[0].reason, /<RowsTable onOpen> <- openRow <- function openRow\)$/);
});

test("a handler passed to a table part through spread props is reported", async () => {
  const violations = await checkFiles([
    {
      path: "rows-screen.tsx",
      source: SCREEN_THE_COMPILER_SKIPPED_PASSING("onClose={openRow} {...{ onOpen: openRow }}"),
    },
    { path: "rows-table.tsx", source: TABLE_PART_WITH_COLUMNS_ON_A_HANDLER_PROP },
  ]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "rows-screen.tsx");
  assert.match(violations[0].reason, /<RowsTable onOpen> <- openRow <- function openRow\)$/);
});

for (const [label, attributes] of [
  ["a module function", "onOpen={openNothing}"],
  ["no handler", ""],
]) {
  test(`a table part handed ${label} reports nothing`, async () => {
    const violations = await checkFiles([
      { path: "rows-screen.tsx", source: SCREEN_THE_COMPILER_SKIPPED_PASSING(attributes) },
      { path: "rows-table.tsx", source: TABLE_PART_WITH_COLUMNS_ON_A_HANDLER_PROP },
    ]);

    assert.deepEqual(violations, []);
  });
}

test("a table part handed a handler the compiler memoizes reports nothing", async () => {
  const violations = await checkFiles([
    { path: "rows-screen.tsx", source: SCREEN_PASSING_A_HANDLER_IT_DECLARES },
    { path: "rows-table.tsx", source: TABLE_PART_WITH_COLUMNS_ON_A_HANDLER_PROP },
  ]);

  assert.deepEqual(violations, []);
});

test("a section passing its own handler prop on is reported where the unmemoized handler enters", async () => {
  const violations = await checkFiles([
    {
      path: "rows-screen.tsx",
      source: SCREEN_RENDERING_THE_SECTION_WITH_A_HANDLER_THE_COMPILER_SKIPPED,
    },
    { path: "rows-section.tsx", source: SECTION_PASSING_ITS_OWN_PROP },
    { path: "rows-table.tsx", source: TABLE_PART_WITH_COLUMNS_ON_A_HANDLER_PROP },
  ]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "rows-screen.tsx");
  assert.match(
    violations[0].reason,
    /<RowsTable onOpen> <- onOpen <- t0 <- <RowsSection onOpen> <- openRow <- function openRow\)$/,
  );
});

test("a section passing on a handler its screen memoizes reports nothing", async () => {
  const violations = await checkFiles([
    { path: "rows-screen.tsx", source: SCREEN_RENDERING_THE_SECTION_WITH_A_MEMOIZED_HANDLER },
    { path: "rows-section.tsx", source: SECTION_PASSING_ITS_OWN_PROP },
    { path: "rows-table.tsx", source: TABLE_PART_WITH_COLUMNS_ON_A_HANDLER_PROP },
  ]);

  assert.deepEqual(violations, []);
});

const TABLE_PART_READING_A_LOADED_HISTORY = [
  'import { dataColumn, useTableModel } from "@purosur/ui";',
  "",
  "const NO_ROWS = [];",
  'const COLUMNS = [dataColumn({ id: "name", header: "Name", render: (item) => item.name })];',
  "",
  "export function HistoryTable({ history }) {",
  '  const rows = history.status === "loaded" ? history.value : NO_ROWS;',
  "  const table = useTableModel({ items: rows, id: (item) => item.id, columns: COLUMNS });",
  "",
  "  return <span>{table.rows.length}</span>;",
  "}",
  "",
].join("\n");

const QUERY_HOOK_WRAPPING_ANOTHER = [
  'import { useQuery } from "@tanstack/react-query";',
  'import { historyKeys } from "./history-keys";',
  "",
  "function useLoaded(options) {",
  "  const query = useQuery(options);",
  '  return query.data === undefined ? { status: "loading" } : { status: "loaded", value: query.data };',
  "}",
  "",
  "export function useHistory({ read, ...query }) {",
  "  return useLoaded({ queryKey: historyKeys.page(query), queryFn: () => read(query) });",
  "}",
  "",
].join("\n");

const SCREEN_PASSING_A_QUERY_RESULT = [
  'import { HistoryTable } from "./history-table";',
  'import { useHistory } from "./history-queries";',
  "",
  "export function HistoryScreen({ read, page }) {",
  "  const history = useHistory({ read, page });",
  "",
  "  return <HistoryTable history={history} />;",
  "}",
  "",
].join("\n");

const NESTED_COMPONENT_PASSING_AN_INLINE_HANDLER = [
  'import { RowsTable } from "./rows-table";',
  "",
  "const NO_ROWS = [];",
  "",
  "export function harnessFor(log) {",
  "  function Harness() {",
  "    return <RowsTable rows={NO_ROWS} onOpen={() => {}} />;",
  "  }",
  "  return Harness;",
  "}",
  "",
].join("\n");

test("rows a query hook hands on from another query hook report nothing", async () => {
  const violations = await checkFiles([
    { path: "history-screen.tsx", source: SCREEN_PASSING_A_QUERY_RESULT },
    { path: "history-queries.ts", source: QUERY_HOOK_WRAPPING_ANOTHER },
    { path: "history-table.tsx", source: TABLE_PART_READING_A_LOADED_HISTORY },
  ]);

  assert.deepEqual(violations, []);
});

test("a component declared inside another function, handing a table part a handler the compiler moves out of it, reports nothing", async () => {
  const violations = await checkFiles([
    { path: "harness.tsx", source: NESTED_COMPONENT_PASSING_AN_INLINE_HANDLER },
    { path: "rows-table.tsx", source: TABLE_PART_WITH_COLUMNS_ON_A_HANDLER_PROP },
  ]);

  assert.deepEqual(violations, []);
});

const ROWS_FROM_A_HOOK_A_FACTORY_MADE = [
  'import { dataColumn, useTableModel } from "@purosur/ui";',
  'import { createHooks } from "@purosur/hooks";',
  "",
  'const COLUMNS = [dataColumn({ id: "name", header: "Name", render: (item) => item.name })];',
  "const { useRows } = createHooks();",
  "",
  "export function Rows() {",
  "  const rows = useRows();",
  "  const table = useTableModel({ items: rows, id: (item) => item.id, columns: COLUMNS });",
  "",
  "  return <span>{table.rows.length}</span>;",
  "}",
  "",
].join("\n");

test("rows from a hook a factory made at module level report nothing", async () => {
  const violations = await checkFiles([
    { path: "rows.tsx", source: ROWS_FROM_A_HOOK_A_FACTORY_MADE },
  ]);

  assert.deepEqual(violations, []);
});
