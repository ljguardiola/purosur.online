import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { planLabelSync } from "./sync-labels.mjs";

// GitHub rejects a label whose description is longer than 100 characters.
const DESCRIPTION_LIMIT = 100;

const definedLabels = JSON.parse(readFileSync(new URL("../labels.json", import.meta.url), "utf8"));

test("every defined label fits what GitHub accepts", () => {
  for (const label of definedLabels) {
    assert.ok(
      label.description.length <= DESCRIPTION_LIMIT,
      `"${label.name}" description is ${label.description.length} characters`,
    );
    assert.match(label.color, /^[0-9a-f]{6}$/);
  }
});

const bugLabel = { name: "type: bug", color: "d73a4a", description: "A bug." };
const featureLabel = { name: "type: feature", color: "1d76db", description: "A feature." };

test("planLabelSync creates every desired label missing from the repository", () => {
  const plan = planLabelSync([], [bugLabel, featureLabel]);
  assert.deepEqual(plan.toCreate, [bugLabel, featureLabel]);
  assert.deepEqual(plan.toUpdate, []);
});

test("planLabelSync does nothing when an existing label already matches", () => {
  const plan = planLabelSync([bugLabel], [bugLabel]);
  assert.deepEqual(plan.toCreate, []);
  assert.deepEqual(plan.toUpdate, []);
});

test("planLabelSync updates a label whose color drifted", () => {
  const existing = { ...bugLabel, color: "ffffff" };
  const plan = planLabelSync([existing], [bugLabel]);
  assert.deepEqual(plan.toCreate, []);
  assert.deepEqual(plan.toUpdate, [bugLabel]);
});

test("planLabelSync updates a label whose description drifted", () => {
  const existing = { ...bugLabel, description: "Something else." };
  const plan = planLabelSync([existing], [bugLabel]);
  assert.deepEqual(plan.toUpdate, [bugLabel]);
});

test("planLabelSync never proposes touching a label it does not know about", () => {
  const unrelated = { name: "priority: high", color: "000000", description: "Urgent." };
  const plan = planLabelSync([unrelated, bugLabel], [bugLabel]);
  assert.deepEqual(plan.toCreate, []);
  assert.deepEqual(plan.toUpdate, []);
  assert.ok(!("toDelete" in plan), "planLabelSync must not offer a delete action");
});

test("planLabelSync is idempotent: running the plan's result back through it yields no further changes", () => {
  const first = planLabelSync([], [bugLabel, featureLabel]);
  const nowExisting = [...first.toCreate];
  const second = planLabelSync(nowExisting, [bugLabel, featureLabel]);
  assert.deepEqual(second.toCreate, []);
  assert.deepEqual(second.toUpdate, []);
});
