import assert from "node:assert/strict";
import { test } from "node:test";
import { selectTestsBeside } from "./tests-beside-changes.mjs";

const TEST_FILES = [
  "packages/domain/src/pricing/model/price.test.ts",
  "packages/domain/src/pricing/model/price.rounding.test.ts",
  "packages/domain/src/pricing/model/price-list.test.ts",
  "packages/domain/src/catalog/model/price.test.ts",
  "apps/cloud/src/catalog/drizzle-catalog-store.integration.test.ts",
  "apps/backoffice/src/catalog/products-list-screen.create.test.tsx",
  "apps/backoffice/src/catalog/products-list-screen.edit.test.tsx",
  "apps/backoffice/src/catalog/product-form.test.tsx",
];

test("selects a changed file's own tests and the tests of each of its aspects", () => {
  assert.deepEqual(
    selectTestsBeside({
      testFiles: TEST_FILES,
      changedFiles: ["packages/domain/src/pricing/model/price.ts"],
    }),
    [
      "packages/domain/src/pricing/model/price.rounding.test.ts",
      "packages/domain/src/pricing/model/price.test.ts",
    ],
  );
});

test("leaves out a test whose name only starts with the changed file's name", () => {
  assert.deepEqual(
    selectTestsBeside({
      testFiles: TEST_FILES,
      changedFiles: ["packages/domain/src/pricing/model/price-list.ts"],
    }),
    ["packages/domain/src/pricing/model/price-list.test.ts"],
  );
});

test("leaves out a test of the same name in another folder", () => {
  assert.deepEqual(
    selectTestsBeside({
      testFiles: TEST_FILES,
      changedFiles: ["packages/domain/src/catalog/model/price.ts"],
    }),
    ["packages/domain/src/catalog/model/price.test.ts"],
  );
});

test("selects a changed test file itself", () => {
  assert.deepEqual(
    selectTestsBeside({
      testFiles: TEST_FILES,
      changedFiles: ["apps/backoffice/src/catalog/products-list-screen.edit.test.tsx"],
    }),
    ["apps/backoffice/src/catalog/products-list-screen.edit.test.tsx"],
  );
});

test("selects an adapter's integration tests", () => {
  assert.deepEqual(
    selectTestsBeside({
      testFiles: TEST_FILES,
      changedFiles: ["apps/cloud/src/catalog/drizzle-catalog-store.ts"],
    }),
    ["apps/cloud/src/catalog/drizzle-catalog-store.integration.test.ts"],
  );
});

test("selects the aspect tests whose setup a changed test-support file holds", () => {
  assert.deepEqual(
    selectTestsBeside({
      testFiles: TEST_FILES,
      changedFiles: ["apps/backoffice/src/catalog/test-support/products-list-screen.tsx"],
    }),
    [
      "apps/backoffice/src/catalog/products-list-screen.create.test.tsx",
      "apps/backoffice/src/catalog/products-list-screen.edit.test.tsx",
    ],
  );
});

test("selects nothing for a package manifest or index that most tests import", () => {
  assert.deepEqual(
    selectTestsBeside({
      testFiles: TEST_FILES,
      changedFiles: ["packages/domain/package.json", "packages/domain/src/index.ts"],
    }),
    [],
  );
});

test("selects a test once when several changed files sit beside it", () => {
  assert.deepEqual(
    selectTestsBeside({
      testFiles: TEST_FILES,
      changedFiles: [
        "apps/backoffice/src/catalog/product-form.tsx",
        "apps/backoffice/src/catalog/product-form.test.tsx",
      ],
    }),
    ["apps/backoffice/src/catalog/product-form.test.tsx"],
  );
});
