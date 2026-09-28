import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkFiles,
  describeViolation,
  findTrackedFiles,
  runCli,
} from "./react-compiler-check.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const CLEAN_COMPONENT = [
  'import { useState } from "react";',
  "",
  "export function Counter({ step }: { step: number }) {",
  "  const [count, setCount] = useState(0);",
  "",
  "  function increment() {",
  "    setCount(count + step);",
  "  }",
  "",
  "  return <button onClick={increment}>{count}</button>;",
  "}",
  "",
].join("\n");

const CLEAN_HOOK = [
  'import { useEffect, useState } from "react";',
  "",
  "export function useCounter(step: number) {",
  "  const [count, setCount] = useState(0);",
  "",
  "  useEffect(() => {",
  "    setCount((current) => current + step);",
  "  }, [step]);",
  "",
  "  return count;",
  "}",
  "",
].join("\n");

const ANGLE_BRACKET_ASSERTION_HOOK = [
  "export function useLabel(value: unknown) {",
  "  return <string>value;",
  "}",
  "",
].join("\n");

const REF_DURING_RENDER = [
  'import { useRef } from "react";',
  "",
  "export function Labeled({ value }: { value: string }) {",
  "  const ref = useRef(value);",
  "  ref.current = value;",
  "",
  "  return <span>static</span>;",
  "}",
  "",
].join("\n");

const HOOK_WITH_TRY_FINALLY = [
  'import { useEffect } from "react";',
  "",
  "export function useGuarded(run: () => void) {",
  "  useEffect(() => {",
  "    try {",
  "      run();",
  "    } finally {",
  '      console.log("done");',
  "    }",
  "  }, [run]);",
  "}",
  "",
].join("\n");

const NON_PRIMITIVE_DEFAULT_PARAM = [
  "export function TagList({ tags = new Set<string>() }: { tags?: Set<string> }) {",
  "  return <span>{tags.size}</span>;",
  "}",
  "",
].join("\n");

test("a clean component reports nothing", async () => {
  const violations = await checkFiles([{ path: "clean-component.tsx", source: CLEAN_COMPONENT }]);

  assert.deepEqual(violations, []);
});

test("a clean hook reports nothing", async () => {
  const violations = await checkFiles([{ path: "clean-hook.ts", source: CLEAN_HOOK }]);

  assert.deepEqual(violations, []);
});

test("a .ts hook using an angle-bracket type assertion reports nothing", async () => {
  const violations = await checkFiles([
    { path: "use-label.ts", source: ANGLE_BRACKET_ASSERTION_HOOK },
  ]);

  assert.deepEqual(violations, []);
});

test("a component writing to a ref during render is reported", async () => {
  const violations = await checkFiles([{ path: "labeled.tsx", source: REF_DURING_RENDER }]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "labeled.tsx");
  assert.match(violations[0].reason, /refs during render/);
});

test("a violation is reported on the line of the offending statement", async () => {
  const [refWrite] = await checkFiles([{ path: "labeled.tsx", source: REF_DURING_RENDER }]);
  const [tryStatement] = await checkFiles([
    { path: "use-guarded.ts", source: HOOK_WITH_TRY_FINALLY },
  ]);

  assert.equal(refWrite.line, 5);
  assert.equal(tryStatement.line, 5);
});

test("a hook with a try/finally the compiler cannot lower is reported", async () => {
  const violations = await checkFiles([{ path: "use-guarded.ts", source: HOOK_WITH_TRY_FINALLY }]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "use-guarded.ts");
  assert.match(violations[0].reason, /TryStatement/);
});

test("a component not compiled because of a non-primitive default param is reported", async () => {
  const violations = await checkFiles([
    { path: "tag-list.tsx", source: NON_PRIMITIVE_DEFAULT_PARAM },
  ]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "tag-list.tsx");
  assert.match(violations[0].reason, /cannot be safely reordered/);
});

test("describes a violation with its file, line and reason", () => {
  const description = describeViolation({ path: "labeled.tsx", line: 5, reason: "boom" });

  assert.equal(description, "labeled.tsx:5: boom");
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

test("runCli reports nothing and exits 0 when every file compiles cleanly", async () => {
  const errors = [];
  const exitCode = await runCli({
    findFiles: () => ["clean.tsx"],
    readFile: () => CLEAN_COMPONENT,
    logError: (line) => errors.push(line),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(errors, []);
});

test("runCli prints every violation and exits 1 when a file cannot be compiled", async () => {
  const errors = [];
  const exitCode = await runCli({
    findFiles: () => ["labeled.tsx"],
    readFile: () => REF_DURING_RENDER,
    logError: (line) => errors.push(line),
  });

  assert.equal(exitCode, 1);
  assert.ok(errors.some((line) => line.startsWith("labeled.tsx:")));
});

test("verify:static runs the React Compiler check before the automation tests", () => {
  const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const script = packageJson.scripts["verify:static"];

  assert.match(script, /node \.github\/scripts\/react-compiler-check\.mjs/);
  assert.ok(
    script.indexOf("node .github/scripts/react-compiler-check.mjs") <
      script.indexOf("node --test .github/scripts/*.test.mjs"),
    "the React Compiler check must run before the automation tests",
  );
});
