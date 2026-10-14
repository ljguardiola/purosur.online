import { execFile } from "node:child_process";
import { appendFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const LOG_PREFIX = "release-version";

// The root files and folders a build reads outside any workspace package: patches/ holds the
// patched dependencies that `pnpm install` applies, and .dockerignore decides what reaches the
// cloud image's build.
const ROOT_BUILD_PATHS = [
  ".dockerignore",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  ".node-version",
  "patches",
];

// The fields `pnpm install --filter <package>...` follows to the workspace packages a build needs.
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"];

export class ReleaseRefusal extends Error {}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function workspaceGlobs(workspaceYaml) {
  const globs = [];
  let inPackages = false;
  for (const line of workspaceYaml.split("\n")) {
    if (/^\S/.test(line)) {
      inPackages = /^packages:\s*$/.test(line);
      continue;
    }
    const entry = inPackages ? /^\s+-\s+(\S+)\s*$/.exec(line) : null;
    if (entry) globs.push(entry[1]);
  }
  return globs;
}

async function readWorkspacePackages({ sha, runGit }) {
  const globs = workspaceGlobs(await runGit(["show", `${sha}:pnpm-workspace.yaml`]));
  const packages = [];
  for (const glob of globs) {
    if (!glob.endsWith("/*") || glob.slice(0, -2).includes("*")) {
      throw new ReleaseRefusal(`${LOG_PREFIX}: unsupported workspace glob ${glob}`);
    }
    const listing = await runGit(["ls-tree", "--name-only", sha, `${glob.slice(0, -1)}`]);
    for (const dir of listing.split("\n").filter((line) => line !== "")) {
      let manifest;
      try {
        manifest = JSON.parse(await runGit(["show", `${sha}:${dir}/package.json`]));
      } catch {
        continue;
      }
      const workspaceDependencies = DEPENDENCY_FIELDS.flatMap((field) =>
        Object.entries(manifest[field] ?? {})
          .filter(([, spec]) => typeof spec === "string" && spec.startsWith("workspace:"))
          .map(([name]) => name),
      );
      packages.push({ name: manifest.name, dir, workspaceDependencies });
    }
  }
  return packages;
}

export async function includedPathsAt({ sha, rootPackages, runGit }) {
  const packages = await readWorkspacePackages({ sha, runGit });
  const byName = new Map(
    packages.map((workspacePackage) => [workspacePackage.name, workspacePackage]),
  );
  const included = new Set();
  const pending = [...rootPackages];
  while (pending.length > 0) {
    const name = pending.pop();
    const workspacePackage = byName.get(name);
    if (workspacePackage === undefined) {
      throw new ReleaseRefusal(`${LOG_PREFIX}: no workspace package named ${name} at ${sha}`);
    }
    if (included.has(workspacePackage.dir)) continue;
    included.add(workspacePackage.dir);
    pending.push(...workspacePackage.workspaceDependencies);
  }
  return [...included, ...ROOT_BUILD_PATHS].sort();
}

function parseVersion(version) {
  return version.split(".").map(Number);
}

function compareVersions(a, b) {
  const [left, right] = [parseVersion(a), parseVersion(b)];
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function isReleaseTag(tag, prefix) {
  return new RegExp(`^${escapeRegExp(prefix)}\\d+\\.\\d+\\.\\d+$`).test(tag);
}

export function releaseTagsNewestFirst(tags, prefix) {
  return tags
    .filter((tag) => isReleaseTag(tag, prefix))
    .sort((a, b) => compareVersions(b.slice(prefix.length), a.slice(prefix.length)));
}

async function releaseTags({ prefix, runGit, mergedInto }) {
  const args = ["tag", "--list", `${prefix}*`];
  if (mergedInto !== undefined) args.push("--merged", mergedInto);
  const stdout = await runGit(args);
  return releaseTagsNewestFirst(stdout.split("\n"), prefix);
}

async function newestReleaseTag({ prefix, sha, runGit }) {
  const [newest] = await releaseTags({ prefix, runGit, mergedInto: sha });
  return newest ?? null;
}

async function assertNotAlreadyReleased({ prefix, sha, runGit }) {
  for (const tag of await releaseTags({ prefix, runGit })) {
    try {
      await runGit(["merge-base", "--is-ancestor", sha, `${tag}^{commit}`]);
    } catch {
      continue;
    }
    throw new ReleaseRefusal(`${LOG_PREFIX}: ${sha} is already part of ${tag}`);
  }
}

const SUBJECT_RE = /^(\w+)(?:\([^)]*\))?(!)?: /;
const BREAKING_FOOTER_RE = /^BREAKING[ -]CHANGE:/m;

export function classifyCommit({ subject, body }) {
  const match = SUBJECT_RE.exec(subject);
  const breaking = match?.[2] === "!" || BREAKING_FOOTER_RE.test(body);
  const kind = match?.[1] === "feat" ? "feature" : match?.[1] === "fix" ? "fix" : "other";
  return { kind, breaking };
}

function kindOf(commit) {
  const { kind, breaking } = classifyCommit(commit);
  return breaking ? "breaking" : kind;
}

export function nextVersion({ previousVersion, kinds }) {
  if (previousVersion === null) return "1.0.0";
  const [major, minor, patch] = parseVersion(previousVersion);
  if (kinds.includes("breaking")) return `${major + 1}.0.0`;
  if (kinds.includes("feature")) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const NOTE_GROUPS = [
  ["breaking", "Breaking changes"],
  ["feature", "Features"],
  ["fix", "Fixes"],
  ["other", "Other changes"],
];

export function releaseNotes(commits) {
  const sections = [];
  for (const [kind, heading] of NOTE_GROUPS) {
    const subjects = commits.filter((commit) => kindOf(commit) === kind).map((c) => c.subject);
    if (subjects.length > 0) {
      sections.push(`## ${heading}\n\n${subjects.map((subject) => `- ${subject}`).join("\n")}\n`);
    }
  }
  return sections.join("\n");
}

async function listCommits({ previousTag, sha, paths, runGit }) {
  const stdout = await runGit([
    "log",
    "--first-parent",
    "--format=%H%x1f%s%x1f%b%x1e",
    previousTag === null ? sha : `${previousTag}..${sha}`,
    "--",
    ...paths,
  ]);
  return stdout
    .split("\x1e")
    .map((record) => record.replace(/^\n/, ""))
    .filter((record) => record !== "")
    .map((record) => {
      const [commitSha, subject, body] = record.split("\x1f");
      return { sha: commitSha, subject, body: body.trim() };
    });
}

export async function planRelease({ spec, sha, runGit }) {
  const { prefix, rootPackages } = spec;
  await assertNotAlreadyReleased({ prefix, sha, runGit });
  const previousTag = await newestReleaseTag({ prefix, sha, runGit });
  const paths = await includedPathsAt({ sha, rootPackages, runGit });
  const commits = await listCommits({ previousTag, sha, paths, runGit });
  if (commits.length === 0) {
    throw new ReleaseRefusal(
      `${LOG_PREFIX}: nothing to release: no included change since ${previousTag ?? "the start"}`,
    );
  }
  const version = nextVersion({
    previousVersion: previousTag === null ? null : previousTag.slice(prefix.length),
    kinds: commits.map(kindOf),
  });
  return {
    version,
    tag: `${prefix}${version}`,
    previousTag,
    commits,
    notes: releaseNotes(commits),
  };
}

async function runGitViaChildProcess(args) {
  const { stdout } = await promisify(execFile)("git", args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

export async function runCli({
  argv = process.argv.slice(2),
  env = process.env,
  runGit = runGitViaChildProcess,
  appendOutput = appendFile,
  writeNotes = writeFile,
  log = console.log,
  logError = console.error,
} = {}) {
  const {
    RELEASE_TAG_PREFIX,
    RELEASE_ROOT_PACKAGES,
    TARGET_SHA,
    RELEASE_NOTES_FILE,
    GITHUB_OUTPUT,
  } = env;
  const [command] = argv;
  const rootPackages = (RELEASE_ROOT_PACKAGES ?? "").split(",").filter((name) => name !== "");
  if (!RELEASE_TAG_PREFIX || !GITHUB_OUTPUT || !TARGET_SHA || rootPackages.length === 0) {
    logError(
      `${LOG_PREFIX}: RELEASE_TAG_PREFIX, RELEASE_ROOT_PACKAGES, TARGET_SHA and GITHUB_OUTPUT are required`,
    );
    return 1;
  }

  try {
    if (command === "plan") {
      if (!RELEASE_NOTES_FILE) {
        logError(`${LOG_PREFIX}: RELEASE_NOTES_FILE is required`);
        return 1;
      }
      const spec = { prefix: RELEASE_TAG_PREFIX, rootPackages };
      const release = await planRelease({ spec, sha: TARGET_SHA, runGit });
      log(
        `${LOG_PREFIX}: ${release.tag} from ${release.commits.length} change(s) since ${release.previousTag ?? "the start"}`,
      );
      await writeNotes(RELEASE_NOTES_FILE, release.notes);
      await appendOutput(GITHUB_OUTPUT, `version=${release.version}\ntag=${release.tag}\n`);
      return 0;
    }
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    return 1;
  }
  logError(`${LOG_PREFIX}: the command must be "plan"`);
  return 1;
}

if (import.meta.main) {
  runCli().then(
    (exitCode) => process.exit(exitCode),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
