import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  compareJournalContents,
  describeViolation,
  findMigrationViolations,
  isJournalFile,
  isProtectedMigrationFile,
  listBasePaths,
  protectedMigrationPaths,
  readBaseBlob,
  readWorkingTreeFile,
  resolveBaseRef,
  resolveBaseSha,
  runGitSync,
} from "./applied-migrations-unchanged.mjs";

function buffer(text) {
  return Buffer.from(text, "utf8");
}

function journal(entries, extra = {}) {
  return buffer(JSON.stringify({ version: "7", dialect: "postgresql", ...extra, entries }));
}

test("treats a cloud migration file as protected", () => {
  assert.ok(isProtectedMigrationFile("apps/cloud/migrations/0003_x.sql"));
});

test("treats a migration's snapshot metadata as protected", () => {
  assert.ok(isProtectedMigrationFile("apps/cloud/migrations/meta/0003_snapshot.json"));
});

test("treats a migration under a nested app source path as protected", () => {
  assert.ok(isProtectedMigrationFile("apps/pos/src/core/migrations/0000_first.sql"));
});

test("does not treat a test file that merely mentions migration in its name as protected", () => {
  assert.equal(isProtectedMigrationFile("apps/cloud/src/db/alerts-migration.test.ts"), false);
});

test("does not treat a migrations directory outside apps/<app>/ as protected", () => {
  assert.equal(isProtectedMigrationFile("packages/db/migrations/0000_first.sql"), false);
  assert.equal(isProtectedMigrationFile("apps/migrations/0000_first.sql"), false);
});

test("does not treat a bare apps/<app>/migrations path with nothing under it as protected", () => {
  assert.equal(isProtectedMigrationFile("apps/cloud/migrations"), false);
});

test("filters a mixed path list down to the protected migration files", () => {
  const paths = [
    "apps/cloud/migrations/0000_x.sql",
    "apps/cloud/src/server.ts",
    "apps/cloud/migrations/meta/_journal.json",
    "README.md",
  ];

  assert.deepEqual(protectedMigrationPaths(paths), [
    "apps/cloud/migrations/0000_x.sql",
    "apps/cloud/migrations/meta/_journal.json",
  ]);
});

test("recognizes a migrations journal file", () => {
  assert.ok(isJournalFile("apps/cloud/migrations/meta/_journal.json"));
});

test("does not treat a snapshot file as the journal", () => {
  assert.equal(isJournalFile("apps/cloud/migrations/meta/0003_snapshot.json"), false);
});

test("does not treat a journal-named file outside meta/migrations as the journal", () => {
  assert.equal(isJournalFile("apps/cloud/migrations/_journal.json"), false);
  assert.equal(isJournalFile("apps/cloud/meta/_journal.json"), false);
});

test("accepts an unchanged journal", () => {
  const entries = [{ idx: 0, tag: "0000_x", when: 1 }];
  const result = compareJournalContents(journal(entries), journal(entries));

  assert.equal(result.ok, true);
});

test("accepts a journal that only appended a new entry", () => {
  const base = journal([{ idx: 0, tag: "0000_x", when: 1 }]);
  const current = journal([
    { idx: 0, tag: "0000_x", when: 1 },
    { idx: 1, tag: "0001_y", when: 2 },
  ]);

  assert.equal(compareJournalContents(base, current).ok, true);
});

test("rejects a journal whose existing entry was changed", () => {
  const base = journal([{ idx: 0, tag: "0000_x", when: 1 }]);
  const current = journal([{ idx: 0, tag: "0000_x", when: 999 }]);

  const result = compareJournalContents(base, current);

  assert.equal(result.ok, false);
});

test("rejects a journal that removed an existing entry", () => {
  const base = journal([
    { idx: 0, tag: "0000_x", when: 1 },
    { idx: 1, tag: "0001_y", when: 2 },
  ]);
  const current = journal([{ idx: 0, tag: "0000_x", when: 1 }]);

  assert.equal(compareJournalContents(base, current).ok, false);
});

test("rejects a journal whose entries were reordered", () => {
  const base = journal([
    { idx: 0, tag: "0000_x", when: 1 },
    { idx: 1, tag: "0001_y", when: 2 },
  ]);
  const current = journal([
    { idx: 1, tag: "0001_y", when: 2 },
    { idx: 0, tag: "0000_x", when: 1 },
  ]);

  assert.equal(compareJournalContents(base, current).ok, false);
});

test("rejects a journal whose top-level dialect field changed", () => {
  const entries = [{ idx: 0, tag: "0000_x", when: 1 }];
  const base = journal(entries, { dialect: "postgresql" });
  const current = journal(entries, { dialect: "sqlite" });

  assert.equal(compareJournalContents(base, current).ok, false);
});

test("rejects a journal that fails to parse as JSON", () => {
  const base = journal([{ idx: 0, tag: "0000_x", when: 1 }]);
  const current = buffer("not json");

  assert.equal(compareJournalContents(base, current).ok, false);
});

test("reports a missing protected file as deleted", () => {
  const violations = findMigrationViolations({
    basePaths: ["apps/cloud/migrations/0000_x.sql"],
    readBase: () => buffer("create table x();"),
    readCurrent: () => undefined,
  });

  assert.deepEqual(violations, [{ path: "apps/cloud/migrations/0000_x.sql", reason: "deleted" }]);
});

test("reports a byte-for-byte changed protected file as modified", () => {
  const violations = findMigrationViolations({
    basePaths: ["apps/cloud/migrations/0000_x.sql"],
    readBase: () => buffer("create table x();"),
    readCurrent: () => buffer("create table x(); -- extra"),
  });

  assert.deepEqual(violations, [{ path: "apps/cloud/migrations/0000_x.sql", reason: "modified" }]);
});

test("reports no violation for an untouched protected file", () => {
  const violations = findMigrationViolations({
    basePaths: ["apps/cloud/migrations/0000_x.sql"],
    readBase: () => buffer("create table x();"),
    readCurrent: () => buffer("create table x();"),
  });

  assert.deepEqual(violations, []);
});

test("never flags a new migration that does not exist at the base", () => {
  const violations = findMigrationViolations({
    basePaths: ["apps/cloud/migrations/0000_x.sql"],
    readBase: () => buffer("create table x();"),
    readCurrent: (path) =>
      path === "apps/cloud/migrations/0000_x.sql" ? buffer("create table x();") : undefined,
  });

  assert.deepEqual(violations, []);
});

test("ignores an unprotected path even when its reader would report a difference", () => {
  const violations = findMigrationViolations({
    basePaths: ["apps/cloud/src/server.ts"],
    readBase: () => buffer("old"),
    readCurrent: () => buffer("new"),
  });

  assert.deepEqual(violations, []);
});

test("reports a journal-specific violation for an edited journal entry", () => {
  const base = journal([{ idx: 0, tag: "0000_x", when: 1 }]);
  const current = journal([{ idx: 0, tag: "0000_x", when: 999 }]);

  const violations = findMigrationViolations({
    basePaths: ["apps/cloud/migrations/meta/_journal.json"],
    readBase: () => base,
    readCurrent: () => current,
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "apps/cloud/migrations/meta/_journal.json");
  assert.match(violations[0].reason, /modified/);
});

test("does not flag a journal that only appended a new entry", () => {
  const base = journal([{ idx: 0, tag: "0000_x", when: 1 }]);
  const current = journal([
    { idx: 0, tag: "0000_x", when: 1 },
    { idx: 1, tag: "0001_y", when: 2 },
  ]);

  const violations = findMigrationViolations({
    basePaths: ["apps/cloud/migrations/meta/_journal.json"],
    readBase: () => base,
    readCurrent: () => current,
  });

  assert.deepEqual(violations, []);
});

test("describes a violation as its path and reason", () => {
  assert.equal(
    describeViolation({ path: "apps/cloud/migrations/0000_x.sql", reason: "deleted" }),
    "apps/cloud/migrations/0000_x.sql: deleted",
  );
});

test("resolves the base ref from the environment when set", () => {
  assert.equal(resolveBaseRef({ MIGRATIONS_BASE_REF: "abc123" }), "abc123");
});

test("falls back to origin/main when the base ref environment variable is unset", () => {
  assert.equal(resolveBaseRef({}), "origin/main");
});

test("falls back to origin/main when the base ref environment variable is empty", () => {
  assert.equal(resolveBaseRef({ MIGRATIONS_BASE_REF: "" }), "origin/main");
});

test("resolves the base sha by asking git for the merge-base with the ref", () => {
  const calls = [];
  const runGit = (args) => {
    calls.push(args);
    return buffer("deadbeef\n");
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

test("lists the paths tracked at the base by asking git for its tree", () => {
  const calls = [];
  const runGit = (args) => {
    calls.push(args);
    return buffer("a.txt\napps/cloud/migrations/0000_x.sql\n");
  };

  const paths = listBasePaths({ base: "deadbeef", runGit });

  assert.deepEqual(paths, ["a.txt", "apps/cloud/migrations/0000_x.sql"]);
  assert.deepEqual(calls, [["ls-tree", "-r", "--name-only", "deadbeef"]]);
});

test("reads a base file's content by asking git to show its blob", () => {
  const calls = [];
  const runGit = (args) => {
    calls.push(args);
    return buffer("create table x();");
  };

  const content = readBaseBlob({
    base: "deadbeef",
    path: "apps/cloud/migrations/0000_x.sql",
    runGit,
  });

  assert.deepEqual(content, buffer("create table x();"));
  assert.deepEqual(calls, [["show", "deadbeef:apps/cloud/migrations/0000_x.sql"]]);
});

test("reads a working tree file's raw bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "applied-migrations-unchanged-"));
  try {
    const filePath = join(dir, "0000_x.sql");
    await writeFile(filePath, "create table x();");

    assert.deepEqual(readWorkingTreeFile(filePath), buffer("create table x();"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("reports a missing working tree file as undefined instead of throwing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "applied-migrations-unchanged-"));
  try {
    assert.equal(readWorkingTreeFile(join(dir, "does-not-exist.sql")), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("no migration already on main is modified or deleted in the working tree", () => {
  const ref = resolveBaseRef(process.env);
  const base = resolveBaseSha({ ref, runGit: runGitSync });
  assert.ok(
    base,
    `could not resolve base ref "${ref}" for the migration guard — fetch it first, e.g. \`git fetch origin main\``,
  );

  const basePaths = listBasePaths({ base, runGit: runGitSync });
  const protectedPaths = protectedMigrationPaths(basePaths);
  assert.ok(
    protectedPaths.includes("apps/cloud/migrations/0000_peaceful_king_bedlam.sql"),
    "expected to find a protected cloud migration already on main",
  );

  const violations = findMigrationViolations({
    basePaths: protectedPaths,
    readBase: (path) => readBaseBlob({ base, path, runGit: runGitSync }),
    readCurrent: readWorkingTreeFile,
  });

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "a migration already on main is never edited or deleted — write a new migration instead",
  );
});
