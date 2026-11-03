import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkFiles,
  describeViolation,
  findTrackedFiles,
  runCli,
} from "./table-columns-memoized-check.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

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

test("describes a violation with its file, line and reason", () => {
  const description = describeViolation({ path: "rows.tsx", line: 5, reason: "boom" });

  assert.equal(description, "rows.tsx:5: boom");
});

test("finds only tracked .ts and .tsx files under the three React roots", () => {
  const files = findTrackedFiles(repoRoot);

  assert.ok(files.length > 0);
  for (const file of files) {
    assert.match(file, /\.tsx?$/);
    assert.ok(
      file.startsWith("apps/backoffice/src/") ||
        file.startsWith("apps/pos/src/renderer/") ||
        file.startsWith("packages/ui/src/"),
      `${file} is outside the React Compiler's roots`,
    );
  }
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
