import assert from "node:assert/strict";
import { test } from "node:test";
import { readMeasurement } from "./dependabot-budget-raise.mjs";

test("readMeasurement reads the sizes and the missing files", () => {
  assert.deepEqual(readMeasurement('{"entry":1,"total":2,"missing":["a.js"]}'), {
    entry: 1,
    total: 2,
    missing: ["a.js"],
  });
});

for (const [description, text] of [
  ["is not JSON", "{"],
  ["lacks a size", '{"entry":1,"missing":[]}'],
  ["holds a size that is not a whole number", '{"entry":1.5,"total":2,"missing":[]}'],
  ["holds a size that is not positive", '{"entry":0,"total":2,"missing":[]}'],
  ["holds a size written as text", '{"entry":"1","total":2,"missing":[]}'],
  ["holds missing files that are not a list of names", '{"entry":1,"total":2,"missing":[3]}'],
  ["holds another field", '{"entry":1,"total":2,"missing":[],"budget":5}'],
  ["is a list", "[1,2]"],
]) {
  test(`readMeasurement refuses a measurement that ${description}`, () => {
    assert.equal(readMeasurement(text), null);
  });
}
