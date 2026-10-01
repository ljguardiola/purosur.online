import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  checkFiles,
  FICTIONAL_TAX_IDENTITIES_PATH,
  fictionalCuitsIn,
  findCuitsOutside,
  findTrackedTextFiles,
} from "./only-fictional-cuits.mjs";

const repoRoot = join(dirname(new URL(import.meta.url).pathname), "../..");

test("finds a check-digit-valid CUIT, hyphenated or not, with the line it is on", () => {
  const source = ['const a = "27-28453196-0";', "", 'const b = "CUIT 20123456786";'].join("\n");

  assert.deepEqual(findCuitsOutside(source, new Set()), [
    { line: 1, cuit: "27-28453196-0" },
    { line: 3, cuit: "20123456786" },
  ]);
});

test("finds a CUIT glued to a word, as in an identifier or a log line", () => {
  assert.deepEqual(findCuitsOutside('"cuit_27284531960"', new Set()), [
    { line: 1, cuit: "27284531960" },
  ]);
});

test("ignores a CUIT whose check digit is wrong, and the prefix no check digit makes valid", () => {
  assert.deepEqual(findCuitsOutside('"27-28453196-1" "20-00026758-0"', new Set()), []);
});

test("ignores eleven digits that do not start with a taxpayer-type prefix", () => {
  assert.deepEqual(findCuitsOutside("memory_size: 12884901888", new Set()), []);
});

test("ignores a CUIT-shaped run inside a longer number", () => {
  assert.deepEqual(
    findCuitsOutside(
      '"127284531960" "272845319601" "1-27-28453196-0" "27-28453196-0-1"',
      new Set(),
    ),
    [],
  );
});

test("allows a CUIT from the fictional set, written with or without hyphens", () => {
  const fictional = new Set(["20000000001"]);

  assert.deepEqual(findCuitsOutside('"20-00000000-1" "20000000001"', fictional), []);
});

test("reads the fictional set from every CUIT written in the shared module", () => {
  const source = [
    'export const FICTIONAL_CUIT = "20-00000000-1";',
    'export const ANOTHER_FICTIONAL_CUIT = "23-00000000-0";',
  ].join("\n");

  assert.deepEqual(fictionalCuitsIn(source), new Set(["20000000001", "23000000000"]));
});

test("reports each file and line holding a CUIT outside the fictional set", () => {
  const files = { "a.test.ts": 'x("20-00000000-1");\ny("27-28453196-0");', "b.ts": "z();" };

  assert.deepEqual(
    checkFiles(Object.keys(files), (path) => files[path], new Set(["20000000001"])),
    ["a.test.ts:2 holds CUIT 27-28453196-0, which is not one of the shared fictional ones"],
  );
});

test("no tracked file holds a check-digit-valid CUIT other than the shared fictional ones", () => {
  const readFile = (path) => readFileSync(join(repoRoot, path), "utf8");
  const fictional = fictionalCuitsIn(readFile(FICTIONAL_TAX_IDENTITIES_PATH));

  assert.ok(fictional.size > 0);
  assert.deepEqual(checkFiles(findTrackedTextFiles(repoRoot), readFile, fictional), []);
});
