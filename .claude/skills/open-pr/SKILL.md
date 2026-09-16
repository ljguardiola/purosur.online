---
name: open-pr
description: Open a pull request built from the repository's PR template, validated locally before creation. Use when asked to open, create, or submit a PR for the current branch.
argument-hint: [issue-number]
---

The pull request contract (required sections, title convention, exactly one
`Closes #N`, Delivery impact rule) lives in `CONTRIBUTING.md` ("Branches and
pull requests") and `.github/pull_request_template.md`. This skill only
sequences the operational steps; it never restates those rules.

1. Confirm the target issue has no sub-issues:
   `gh api repos/{owner}/{repo}/issues/<N> --jq .sub_issues_summary.total`.
   If the total is greater than zero, stop and explain that a pull request
   must close one of that issue's sub-issues instead (see "Issues" in
   `CONTRIBUTING.md`) — do not open a PR against the parent.
2. Copy `.github/pull_request_template.md` and fill every section for real:
   `Closes #<N>` under Issue, the approach under How, decisions (or "None.")
   under Technical decisions, what was tested under How it was tested, and
   check the Delivery impact boxes that apply. Save the filled body to a file
   (do not hand an empty template to `--body`).
3. Run the same local check the PreToolUse hook and CI use, before creating
   the PR:
   ```
   node -e '
   import("./.github/scripts/validate-pr.mjs").then(({ validatePrBodyLocal }) => {
     const fs = require("node:fs");
     const body = fs.readFileSync(process.argv[2], "utf8");
     const problems = validatePrBodyLocal({ title: process.argv[1], body });
     if (problems.length > 0) {
       console.error(problems.join("\n"));
       process.exit(1);
     }
   });
   ' "<PR title>" <path-to-filled-body>
   ```
   Fix any reported problem before continuing. This only checks what's
   decidable without repository access; CI's `pr-contract` check still
   verifies the referenced issue's existence, state, type match, and
   sub-issues.
4. Create the PR with the filled file, never an inline `--body`:
   `gh pr create --title "<type>: <subject>" --body-file <path>`.
