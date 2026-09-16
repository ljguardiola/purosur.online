import assert from "node:assert/strict";
import { test } from "node:test";
import { isEmptyContent, parseSections } from "./sections.mjs";

test("parseSections extracts heading content at the requested marker level", () => {
  const body = ["### Goal", "Ship the thing.", "", "### Out of scope", "Nothing."].join("\n");
  const sections = parseSections(body, 3);
  assert.equal(sections.get("Goal"), "Ship the thing.");
  assert.equal(sections.get("Out of scope"), "Nothing.");
});

test("parseSections trims trailing and leading blank lines from content", () => {
  const body = ["### Goal", "", "  Ship the thing.  ", "", ""].join("\n");
  const sections = parseSections(body, 3);
  assert.equal(sections.get("Goal"), "Ship the thing.");
});

test("parseSections does not confuse a deeper heading level with the requested one", () => {
  const body = ["## How", "Text under level two.", "### Not this one", "Nested content."].join(
    "\n",
  );
  const sections = parseSections(body, 2);
  assert.equal(sections.get("How"), "Text under level two.\n### Not this one\nNested content.");
  assert.equal(sections.has("Not this one"), false);
});

test("parseSections ignores a shallower heading level", () => {
  const body = ["# Title", "### Goal", "content"].join("\n");
  const sections = parseSections(body, 3);
  assert.equal(sections.has("Title"), false);
  assert.equal(sections.get("Goal"), "content");
});

test("parseSections returns an empty map for an empty body", () => {
  const sections = parseSections("", 3);
  assert.equal(sections.size, 0);
});

test("parseSections returns an empty map for a null body", () => {
  const sections = parseSections(null, 3);
  assert.equal(sections.size, 0);
});

test("isEmptyContent treats whitespace-only content as empty", () => {
  assert.equal(isEmptyContent("   \n  "), true);
});

test("isEmptyContent treats GitHub's placeholder as empty", () => {
  assert.equal(isEmptyContent("_No response_"), true);
});

test("isEmptyContent treats real content as non-empty", () => {
  assert.equal(isEmptyContent("Some real answer."), false);
});

test("isEmptyContent treats null or undefined as empty", () => {
  assert.equal(isEmptyContent(null), true);
  assert.equal(isEmptyContent(undefined), true);
});
