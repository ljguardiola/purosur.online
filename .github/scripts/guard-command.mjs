// Pure decision logic behind the Claude Code PreToolUse hook
// (`.claude/hooks/pretool.mjs`). It inspects a raw shell command string and
// returns a list of problems; an empty list means the command is allowed.
//
// This module enforces operational git/gh hygiene only (branch protection,
// hook bypass flags, release tags, and template completeness). It is not a
// second copy of the repository contract: the PR and issue body checks below
// call the same `validatePr`/`validateIssue` machinery the CI workflows use
// (`.github/scripts/validate-pr.mjs`, `.github/scripts/validate-issue.mjs`),
// so the rules themselves live in exactly one place.
//
// A command this module cannot parse, or a `gh`/`git` invocation whose shape
// it does not recognize, is allowed through: this guard only ever adds
// problems for a rule it positively matched, never for uncertainty.

import { detectIssueType, validateIssue } from "./validate-issue.mjs";
import { validatePrBodyLocal } from "./validate-pr.mjs";

const SEPARATOR_TOKENS = new Set(["&&", "||", ";", "|"]);
const ENV_ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const RELEASE_TAG_PATTERN = /^(cloud|pos)-v/;
const GIT_TAG_VALUE_FLAGS = new Set(["-m", "--message", "-F", "--file", "-u", "--local-user"]);

// Global git options that take a value as a separate following token when
// not written as `--opt=value`. `-C`, `-c` and the undocumented
// `--shallow-file` never accept `=value`; `--exec-path` and `--list-cmds`
// only accept `=value`, so they are value-less flags here.
const GIT_GLOBAL_VALUE_FLAGS = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env",
  "--attr-source",
  "--shallow-file",
]);

// Global git options that also select which repository (and so which
// branch) the command runs against.
const GIT_LOCATION_FLAGS = new Set(["-C", "--git-dir", "--work-tree"]);

// Env-assignment prefixes equivalent to a `--git-dir=`/`--work-tree=` global
// option; `stripEnvAssignments` otherwise drops these silently.
const ENV_LOCATION_OPTIONS = { GIT_DIR: "--git-dir", GIT_WORK_TREE: "--work-tree" };

// --- tokenizing --------------------------------------------------------

function tokenize(command) {
  const tokens = [];
  let i = 0;
  const n = command.length;

  while (i < n) {
    const ch = command[i];

    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if (ch === "\n") {
      tokens.push(";");
      i++;
      continue;
    }
    if (ch === "&" && command[i + 1] === "&") {
      tokens.push("&&");
      i += 2;
      continue;
    }
    if (ch === "|" && command[i + 1] === "|") {
      tokens.push("||");
      i += 2;
      continue;
    }
    if (ch === ";") {
      tokens.push(";");
      i++;
      continue;
    }
    if (ch === "|") {
      tokens.push("|");
      i++;
      continue;
    }

    let word = "";
    while (i < n) {
      const c = command[i];
      if (c === " " || c === "\t" || c === "\n" || c === ";" || c === "|") {
        break;
      }
      if (c === "&" && command[i + 1] === "&") {
        break;
      }
      if (c === "'") {
        const end = command.indexOf("'", i + 1);
        const stop = end === -1 ? n : end;
        word += command.slice(i + 1, stop);
        i = stop + 1;
        continue;
      }
      if (c === '"') {
        const end = command.indexOf('"', i + 1);
        const stop = end === -1 ? n : end;
        word += command.slice(i + 1, stop);
        i = stop + 1;
        continue;
      }
      word += c;
      i++;
    }
    tokens.push(word);
  }

  return tokens;
}

function splitSegments(command) {
  const tokens = tokenize(command);
  const segments = [];
  let current = [];

  for (const token of tokens) {
    if (SEPARATOR_TOKENS.has(token)) {
      if (current.length > 0) {
        segments.push(current);
      }
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

function stripEnvAssignments(tokens) {
  let index = 0;
  while (index < tokens.length && ENV_ASSIGNMENT_PATTERN.test(tokens[index])) {
    index++;
  }
  return tokens.slice(index);
}

// Reads the leading `NAME=value` prefix and returns any `GIT_DIR=`/
// `GIT_WORK_TREE=` entries, normalized into `--git-dir=`/`--work-tree=`
// global-option form, in the order they appeared.
function collectEnvLocationArgs(tokens) {
  const locationArgs = [];
  let index = 0;
  while (index < tokens.length && ENV_ASSIGNMENT_PATTERN.test(tokens[index])) {
    const eq = tokens[index].indexOf("=");
    const name = tokens[index].slice(0, eq);
    const option = ENV_LOCATION_OPTIONS[name];
    if (option) {
      locationArgs.push(`${option}=${tokens[index].slice(eq + 1)}`);
    }
    index++;
  }
  return locationArgs;
}

// Skips git's global options to find the subcommand, collecting the
// location-changing ones (`-C`, `--git-dir`, `--work-tree`) along the way.
// A value flag consumes the next token unless its value is attached with
// `=`; every other leading `-`/`--` token is a flag with no value.
function parseGitGlobalOptions(rest) {
  const locationArgs = [];
  let index = 0;

  while (index < rest.length && rest[index].startsWith("-")) {
    const token = rest[index];
    const eq = token.indexOf("=");
    const name = eq === -1 ? token : token.slice(0, eq);
    const isLocation = GIT_LOCATION_FLAGS.has(name);

    if (eq !== -1) {
      if (isLocation) {
        locationArgs.push(token);
      }
      index++;
      continue;
    }

    if (GIT_GLOBAL_VALUE_FLAGS.has(name)) {
      const value = rest[index + 1];
      if (isLocation) {
        locationArgs.push(token);
        if (value !== undefined) {
          locationArgs.push(value);
        }
      }
      index += 2;
      continue;
    }

    index++;
  }

  return { sub: rest[index], args: rest.slice(index + 1), locationArgs };
}

// Resolves the branch the guard should judge: with no location args,
// `context.branch` (the session cwd's branch); with location args,
// `context.branchFor(locationArgs)`. A missing or failing resolver, or a
// null result, means "branch unknown", which fails open on branch rules
// without hiding the rules that do not depend on the branch.
function resolveBranch(context, locationArgs) {
  if (locationArgs.length === 0) {
    return context.branch ?? null;
  }
  if (typeof context.branchFor !== "function") {
    return null;
  }
  try {
    return context.branchFor(locationArgs) ?? null;
  } catch {
    return null;
  }
}

// --- flag parsing --------------------------------------------------------

// Parses `tokens` (already past the subcommand) for a fixed set of flags.
// `valueFlags` take a following (or `--flag=value`) argument and may repeat
// (each occurrence is collected); `boolFlags` are presence-only.
function parseFlags(tokens, { valueFlags, boolFlags, aliases = {} }) {
  const values = {};
  const bools = new Set();

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith("-")) {
      continue;
    }

    let name = token;
    let inlineValue = null;
    const eq = token.indexOf("=");
    if (eq !== -1) {
      name = token.slice(0, eq);
      inlineValue = token.slice(eq + 1);
    }

    const canonical = aliases[name] ?? name;

    if (valueFlags.has(canonical)) {
      const value = inlineValue !== null ? inlineValue : tokens[++i];
      if (value === undefined) {
        continue;
      }
      if (!values[canonical]) {
        values[canonical] = [];
      }
      values[canonical].push(value);
    } else if (boolFlags.has(canonical)) {
      bools.add(canonical);
    }
  }

  return { values, bools };
}

// --- git rules -------------------------------------------------------------

function checkGitCommit(rest, branch, problems) {
  if (rest.includes("--no-verify")) {
    problems.push("Do not bypass hooks with --no-verify on git commit.");
  }
  if (branch === "main") {
    problems.push("Do not commit directly on main; create a feature branch first.");
  }
}

function isForceFlag(token) {
  return token === "--force" || token === "-f" || /^--force-with-lease(=.*)?$/.test(token);
}

function checkGitPush(rest, branch, problems) {
  const positional = [];
  let hasNoVerify = false;
  let hasForce = false;

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === "--no-verify") {
      hasNoVerify = true;
      continue;
    }
    if (isForceFlag(token)) {
      hasForce = true;
      continue;
    }
    if (token.startsWith("-")) {
      if (token === "--repo" || token === "-R") {
        i++;
      }
      continue;
    }
    positional.push(token);
  }

  if (hasNoVerify) {
    problems.push("Do not bypass hooks with --no-verify on git push.");
  }
  if (hasForce) {
    problems.push("Do not force-push; --force, -f, and --force-with-lease are all blocked.");
  }

  let targetsMain = false;
  if (positional.length === 0) {
    targetsMain = branch === "main";
  } else {
    const refspecs = positional.slice(1);
    if (refspecs.length === 0) {
      targetsMain = branch === "main";
    } else {
      targetsMain = refspecs.some((spec) => {
        const parts = spec.split(":");
        const dest = parts.length > 1 ? parts[1] : parts[0];
        return dest.replace(/^refs\/heads\//, "") === "main";
      });
    }
  }

  if (targetsMain) {
    problems.push("Do not push to main directly; push a feature branch and open a pull request.");
  }
}

function checkGitTag(rest, problems) {
  if (rest.includes("-d") || rest.includes("--delete")) {
    return;
  }

  let tagName = null;
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token.startsWith("-")) {
      if (GIT_TAG_VALUE_FLAGS.has(token)) {
        i++;
      }
      continue;
    }
    tagName = token;
    break;
  }

  if (tagName && RELEASE_TAG_PATTERN.test(tagName)) {
    problems.push(
      `Do not create "${tagName}" locally; cloud-vX.Y.Z and pos-vX.Y.Z tags are created by the release workflow.`,
    );
  }
}

// --- gh pr / gh issue body rules --------------------------------------

const BODY_FLAG_ALIASES = { "-b": "--body", "-F": "--body-file", "-t": "--title", "-w": "--web" };

function resolveBody(values, bools, context, problems, label) {
  if (bools.has("--web")) {
    return { skip: true };
  }

  const bodyFile = values["--body-file"]?.[0];
  const bodyInline = values["--body"]?.[0];

  if (bodyFile !== undefined) {
    const content = context.readFile ? context.readFile(bodyFile) : null;
    if (content === null || content === undefined) {
      problems.push(`Could not read "${bodyFile}"; check the path before running ${label}.`);
      return { skip: true };
    }
    return { body: content };
  }

  if (bodyInline !== undefined) {
    return { body: bodyInline };
  }

  problems.push(
    `${label} needs --body-file <path> (or --body) with the filled template so it can be checked here; ` +
      "an interactive editor session cannot be validated. Use --web to fill it in the browser instead.",
  );
  return { skip: true };
}

function checkGhPr(tokens, verb, context, problems) {
  const label = `gh pr ${verb}`;
  const { values, bools } = parseFlags(tokens.slice(2), {
    valueFlags: new Set(["--body", "--body-file", "--title"]),
    boolFlags: new Set(["--web"]),
    aliases: BODY_FLAG_ALIASES,
  });

  const resolved = resolveBody(values, bools, context, problems, label);
  if (resolved.skip) {
    return;
  }

  const title = values["--title"]?.[0];
  const local = validatePrBodyLocal({ title, body: resolved.body });
  if (local.length > 0) {
    problems.push(...local.map((problem) => `PR body: ${problem}`));
    problems.push(
      "Local check only: CI's pr-contract workflow still verifies the referenced issue exists, " +
        "is open, matches the PR type, and has no sub-issues.",
    );
  }
}

function checkGhIssue(tokens, verb, context, problems) {
  const label = `gh issue ${verb}`;
  const { values, bools } = parseFlags(tokens.slice(2), {
    valueFlags: new Set(["--body", "--body-file", "--title", "--label", "--add-label"]),
    boolFlags: new Set(["--web"]),
    aliases: { ...BODY_FLAG_ALIASES, "-l": "--label" },
  });

  const resolved = resolveBody(values, bools, context, problems, label);
  if (resolved.skip) {
    return;
  }

  const labels = [...(values["--label"] ?? []), ...(values["--add-label"] ?? [])];
  const type = detectIssueType(labels);
  if (type === null) {
    // The type label may come from --template (resolved by GitHub, not
    // knowable here) or already exist on the issue (for `edit`). Without a
    // type, section requirements can't be decided locally; CI's
    // issue-format workflow labels it invalid-format if it is wrong.
    return;
  }

  const local = validateIssue({ body: resolved.body, labels });
  if (local.length > 0) {
    problems.push(...local.map((problem) => `Issue body: ${problem}`));
    problems.push(
      "Local check only: CI's issue-format workflow re-checks this after creation and applies " +
        "the invalid-format label if it is still wrong.",
    );
  }
}

// --- dispatch --------------------------------------------------------------

function checkSegment(tokens, context, problems) {
  const envLocationArgs = collectEnvLocationArgs(tokens);
  const cmdTokens = stripEnvAssignments(tokens);
  if (cmdTokens.length === 0) {
    return;
  }

  const [head, ...rest] = cmdTokens;

  if (head === "git") {
    const { sub, args, locationArgs } = parseGitGlobalOptions(rest);
    const allLocationArgs = [...envLocationArgs, ...locationArgs];
    if (sub === "commit") {
      checkGitCommit(args, resolveBranch(context, allLocationArgs), problems);
    } else if (sub === "push") {
      checkGitPush(args, resolveBranch(context, allLocationArgs), problems);
    } else if (sub === "tag") {
      checkGitTag(args, problems);
    }
    return;
  }

  if (head === "gh") {
    const [noun, verb] = rest;
    if (noun === "pr" && (verb === "create" || verb === "edit")) {
      checkGhPr(cmdTokens, verb, context, problems);
    } else if (noun === "issue" && (verb === "create" || verb === "edit")) {
      checkGhIssue(cmdTokens, verb, context, problems);
    }
  }
}

export function checkCommand(command, context = {}) {
  const problems = [];

  if (typeof command !== "string" || command.trim() === "") {
    return problems;
  }

  let segments;
  try {
    segments = splitSegments(command);
  } catch {
    return problems;
  }

  for (const tokens of segments) {
    try {
      checkSegment(tokens, context, problems);
    } catch {
      // A rule that cannot make sense of this segment never blocks it.
    }
  }

  return problems;
}
