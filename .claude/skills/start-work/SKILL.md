---
name: start-work
description: Start work on a GitHub issue - validates the issue against the repository contract, creates a branch, and states the commit type its type requires. Use when asked to start, pick up, or work on issue #N.
argument-hint: [issue-number]
---

Rules for issue types, required sections, and commit types live in
`CONTRIBUTING.md` ("Issues" and "Branches and pull requests"). This skill only
sequences the operational steps; it never restates those rules.

1. Fetch the issue: `gh issue view <N> --json number,state,labels,body,title`.
   Refuse to continue if `state` is not `open`.
2. Validate it locally with the same logic CI uses, instead of re-deriving the
   rules:
   ```
   node -e '
   import("./.github/scripts/validate-issue.mjs").then(({ validateIssue, detectIssueType }) => {
     const issue = JSON.parse(process.argv[1]);
     const labels = issue.labels.map((l) => l.name);
     const problems = validateIssue({ body: issue.body, labels });
     if (problems.length > 0) {
       console.error(problems.join("\n"));
       process.exit(1);
     }
     console.log(detectIssueType(labels));
   });
   ' "$(gh issue view <N> --json labels,body)"
   ```
   If this reports problems, stop and tell the user the issue does not follow
   the template yet (do not fix the issue body yourself unless asked).
3. If the issue type is `spike`, stop: spikes don't get a pull request or a
   branch (see "Issues" in `CONTRIBUTING.md`).
4. Create a branch from the issue using the branch naming convention in
   "Branches and pull requests" in `CONTRIBUTING.md`: `git checkout -b
   <type>/<N>-<short-slug>`, with the Conventional Commit type that matches
   this issue's type.
5. State plainly which commit type the eventual PR title must use, per the
   issue-type-to-commit-type mapping in `CONTRIBUTING.md`, so later commits on
   this branch are consistent with it.
