import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveBaseRef, resolveBaseSha } from "./change-base.mjs";

test("resolves the base ref from the environment when set", () => {
  assert.equal(resolveBaseRef({ CHANGE_BASE_REF: "abc123" }), "abc123");
});

test("falls back to origin/main when the base ref environment variable is unset", () => {
  assert.equal(resolveBaseRef({}), "origin/main");
});

test("falls back to origin/main when the base ref environment variable is empty", () => {
  assert.equal(resolveBaseRef({ CHANGE_BASE_REF: "" }), "origin/main");
});

test("resolves the base sha by asking git for the merge-base with the ref", () => {
  const calls = [];
  const runGit = (args) => {
    calls.push(args);
    return Buffer.from("deadbeef\n", "utf8");
  };

  const base = resolveBaseSha({ ref: "origin/main", runGit });

  assert.equal(base, "deadbeef");
  assert.deepEqual(calls, [["merge-base", "HEAD", "origin/main"]]);
});

test("resolves to null when git cannot find the merge-base", () => {
  const runGit = () => {
    throw new Error("fatal: not a valid object name origin/main");
  };

  assert.equal(resolveBaseSha({ ref: "origin/main", runGit }), null);
});
