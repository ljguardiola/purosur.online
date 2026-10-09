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

test("finds a CUIT, hyphenated or not, with the line it is on", () => {
  const source = ['const a = "20-00000000-1";', "", 'const b = "CUIT 20123456786";'].join("\n");

  assert.deepEqual(findCuitsOutside(source, new Set()), [
    { line: 1, cuit: "20-00000000-1" },
    { line: 3, cuit: "20123456786" },
  ]);
});

test("finds a CUIT glued to a word, as in an identifier or a log line", () => {
  assert.deepEqual(findCuitsOutside('"cuit_20000000001"', new Set()), [
    { line: 1, cuit: "20000000001" },
  ]);
});

test("finds a CUIT whose check digit is wrong, written with or without hyphens", () => {
  assert.deepEqual(findCuitsOutside('"23-00000000-5" "2300000000-5" "23000000005"', new Set()), [
    { line: 1, cuit: "23-00000000-5" },
    { line: 1, cuit: "2300000000-5" },
    { line: 1, cuit: "23000000005" },
  ]);
});

test("finds a CUIT whose first ten digits no check digit makes valid", () => {
  assert.deepEqual(findCuitsOutside('"26-00000000-0"', new Set()), [
    { line: 1, cuit: "26-00000000-0" },
  ]);
});

test("ignores eleven digits that do not start with a taxpayer-type prefix", () => {
  assert.deepEqual(findCuitsOutside("memory_size: 12884901888", new Set()), []);
});

test("ignores a CUIT-shaped run inside a longer number", () => {
  assert.deepEqual(
    findCuitsOutside(
      '"120000000001" "200000000011" "1-20-00000000-1" "20-00000000-1-1"',
      new Set(),
    ),
    [],
  );
});

test("allows a CUIT from the fictional set, written with or without hyphens", () => {
  const fictional = new Set(["20000000001"]);

  assert.deepEqual(findCuitsOutside('"20-00000000-1" "20000000001"', fictional), []);
});

test("allows a fictional CUIT with only its check digit changed, with or without hyphens", () => {
  const fictional = new Set(["20000000001"]);

  assert.deepEqual(
    findCuitsOutside('"20-00000000-2" "2000000000-9" "20000000000"', fictional),
    [],
  );
});

test("finds a CUIT that differs from a fictional one in more than its check digit", () => {
  assert.deepEqual(findCuitsOutside('"20-12345678-6"', new Set(["20000000001"])), [
    { line: 1, cuit: "20-12345678-6" },
  ]);
});

test("reads the fictional set from every CUIT written in the shared module, valid or not", () => {
  const source = [
    'export const FICTIONAL_CUIT = "20-00000000-1";',
    'export const ANOTHER_FICTIONAL_CUIT = "23-00000000-0";',
    'export const CUIT_NUMBER_NO_CHECK_DIGIT_VALIDATES = "26-00000000-0";',
  ].join("\n");

  assert.deepEqual(
    fictionalCuitsIn(source),
    new Set(["20000000001", "23000000000", "26000000000"]),
  );
});

test("reports each file and line holding a CUIT outside the fictional set", () => {
  const files = { "a.test.ts": 'x("20-00000000-1");\ny("23-00000000-0");', "b.ts": "z();" };

  assert.deepEqual(
    checkFiles(Object.keys(files), (path) => files[path], new Set(["20000000001"])),
    ["a.test.ts:2 holds CUIT 23-00000000-0, which is neither one of the shared fictional ones nor one of them with another check digit"],
  );
});

test("no tracked file holds a CUIT other than the shared fictional ones and their check-digit variants", () => {
  const readFile = (path) => readFileSync(join(repoRoot, path), "utf8");
  const fictional = fictionalCuitsIn(readFile(FICTIONAL_TAX_IDENTITIES_PATH));

  assert.ok(fictional.size > 0);
  assert.deepEqual(checkFiles(findTrackedTextFiles(repoRoot), readFile, fictional), []);
});
