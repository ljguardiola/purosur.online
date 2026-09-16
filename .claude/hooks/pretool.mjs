#!/usr/bin/env node
// Claude Code PreToolUse hook for the Bash tool.
//
// Thin wrapper only: it reads the hook payload from stdin, extracts the Bash
// command, and asks the pure decision logic in
// .github/scripts/guard-command.mjs whether the command violates the
// repository contract (CONTRIBUTING.md). All rules live in that module (and
// the validators it reuses); this file adds no rules of its own.
//
// Deny mechanism: exit code 2 with the reason on stderr, per
// https://docs.claude.com/en/docs/claude-code/hooks ("Exit Code 2 (Blocking)").
// Anything this hook cannot parse, or any error while checking, fails open
// (exit 0) rather than blocking: a hook must never block a command it does
// not understand.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { checkCommand } from "../../.github/scripts/guard-command.mjs";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function currentBranch(cwd) {
  try {
    // Works even before the first commit (unlike `git rev-parse
    // --abbrev-ref HEAD`, which fails on an unborn branch).
    const branch = execFileSync("git", ["branch", "--show-current"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return branch === "" ? null : branch;
  } catch {
    return null;
  }
}

function readFile(cwd, filePath) {
  try {
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
    return readFileSync(resolved, "utf8");
  } catch {
    return null;
  }
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readStdin());
  } catch {
    process.exit(0);
  }

  if (payload?.tool_name !== "Bash") {
    process.exit(0);
  }

  const command = payload.tool_input?.command;
  if (typeof command !== "string") {
    process.exit(0);
  }

  const cwd = typeof payload.cwd === "string" ? payload.cwd : process.cwd();

  let problems;
  try {
    problems = checkCommand(command, {
      branch: currentBranch(cwd),
      readFile: (filePath) => readFile(cwd, filePath),
    });
  } catch {
    process.exit(0);
  }

  if (!problems || problems.length === 0) {
    process.exit(0);
  }

  const message = [
    "This command violates the repository contract (see CONTRIBUTING.md):",
    "",
    ...problems.map((problem) => `- ${problem}`),
  ].join("\n");

  process.stderr.write(`${message}\n`);
  process.exit(2);
}

main();
