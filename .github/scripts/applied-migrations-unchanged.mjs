import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const MIGRATIONS_DIR_SEGMENT = "migrations";
const META_DIR_SEGMENT = "meta";
const JOURNAL_FILE_NAME = "_journal.json";
const REGENERATE_ON_MAIN = "regenerate the migration on top of the current main";

export function isProtectedMigrationFile(path) {
  const segments = path.split("/");
  if (segments[0] !== "apps") return false;
  const migrationsIndex = segments.indexOf(MIGRATIONS_DIR_SEGMENT, 2);
  return migrationsIndex !== -1 && migrationsIndex < segments.length - 1;
}

export function protectedMigrationPaths(paths) {
  return paths.filter(isProtectedMigrationFile);
}

export function isJournalFile(path) {
  const segments = path.split("/");
  return (
    segments.at(-1) === JOURNAL_FILE_NAME &&
    segments.at(-2) === META_DIR_SEGMENT &&
    segments.at(-3) === MIGRATIONS_DIR_SEGMENT
  );
}

// drizzle-kit only ever appends a new entry to a migrations journal, so a later entry can be added
// but an existing one is never expected to change.
function isPrefixExtension(baseEntries, currentEntries) {
  return (
    Array.isArray(baseEntries) &&
    Array.isArray(currentEntries) &&
    currentEntries.length >= baseEntries.length &&
    baseEntries.every((entry, index) => isDeepStrictEqual(entry, currentEntries[index]))
  );
}

// drizzle's migrator applies only the migrations dated after the last one it already applied, so a
// new entry dated at or before an entry on main would never run.
function misdatedNewEntryTags(baseEntries, currentEntries) {
  const latestBaseWhen = Math.max(...baseEntries.map((entry) => entry.when));
  return currentEntries
    .slice(baseEntries.length)
    .filter(
      (entry) =>
        !(isPlainObject(entry) && typeof entry.when === "number" && entry.when > latestBaseWhen),
    )
    .map((entry) => (isPlainObject(entry) ? entry.tag : JSON.stringify(entry)));
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function compareJournalContents(baseBuffer, currentBuffer) {
  let base;
  let current;
  try {
    base = JSON.parse(baseBuffer.toString("utf8"));
    current = JSON.parse(currentBuffer.toString("utf8"));
  } catch {
    return { ok: false, reason: "modified: could not be parsed as JSON" };
  }
  if (!isPlainObject(base) || !isPlainObject(current)) {
    return { ok: false, reason: "modified: is not a journal object" };
  }
  const { entries: baseEntries, ...baseRest } = base;
  const { entries: currentEntries, ...currentRest } = current;
  if (!isDeepStrictEqual(baseRest, currentRest)) {
    return { ok: false, reason: "modified: a field other than entries changed" };
  }
  if (!isPrefixExtension(baseEntries, currentEntries)) {
    return {
      ok: false,
      reason: `modified: an existing entry changed, was removed, or was reordered — keep main's entries as they are and ${REGENERATE_ON_MAIN}`,
    };
  }
  const misdatedTags = misdatedNewEntryTags(baseEntries, currentEntries);
  if (misdatedTags.length > 0) {
    return {
      ok: false,
      reason: `new entries not dated after every entry already on main: ${misdatedTags.join(", ")} — ${REGENERATE_ON_MAIN}`,
    };
  }
  return { ok: true };
}

export function findMigrationViolations({ basePaths, readBase, readCurrent }) {
  const violations = [];
  for (const path of protectedMigrationPaths(basePaths)) {
    const current = readCurrent(path);
    if (current === undefined) {
      violations.push({ path, reason: "deleted" });
      continue;
    }
    const base = readBase(path);
    if (isJournalFile(path)) {
      const result = compareJournalContents(base, current);
      if (!result.ok) violations.push({ path, reason: result.reason });
      continue;
    }
    if (!base.equals(current)) {
      violations.push({ path, reason: "modified" });
    }
  }
  return violations;
}

export function describeViolation({ path, reason }) {
  return `${path}: ${reason}`;
}

export function listBasePaths({ base, runGit }) {
  return runGit(["ls-tree", "-r", "-z", "--name-only", base])
    .toString("utf8")
    .split("\0")
    .filter((path) => path !== "");
}

export function readBaseBlob({ base, path, runGit }) {
  return runGit(["show", `${base}:${path}`]);
}

export function readWorkingTreeFile(path) {
  try {
    return readFileSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

export function runGitSync(args) {
  return execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 });
}
