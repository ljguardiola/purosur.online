---
name: start-work
description: Start work on a GitHub issue - validates the issue against the repository contract, creates or reuses the branch the issue links, gives it its own worktree, and states the commit type its type requires. Use when asked to start, pick up, or work on issue #N.
argument-hint: [issue-number]
---

Rules for issue types, required sections, and commit types live in
`.claude/rules/workflow.md` ("Issues" and "Branches and pull requests"). This skill only
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
   branch (see "Issues" in `.claude/rules/workflow.md`).
4. Find the branch the issue already links: `gh issue develop --list <N>`.
   If the current directory is a linked worktree
   (`git rev-parse --path-format=absolute --git-dir` differs from
   `git rev-parse --path-format=absolute --git-common-dir`) already on that branch
   (`git branch --show-current`), skip to step 7. If the main checkout has
   that branch checked out, stop and tell the user: a branch is checked out
   in one worktree at a time, so the main checkout must go back to `main`
   first. Never switch it yourself.
5. When the issue links no branch, create it from the issue, so GitHub links
   the branch and its pull request to the issue. Name it with the branch
   naming convention in "Branches and pull requests" in
   `.claude/rules/workflow.md`, with the Conventional Commit type that matches
   this issue's type:
   ```
   gh issue develop <N> --name <type>/<N>-<short-slug> --base main
   ```
6. Give the branch its own worktree beside the main checkout, never checking
   it out in the main checkout. Run from the main checkout:
   ```
   git fetch origin <branch>
   git worktree add ../purosur.online.worktrees/<N>-<short-slug> <branch>
   git -C ../purosur.online.worktrees/<N>-<short-slug> branch --set-upstream-to=origin/<branch>
   ```
   That `worktree add` is for a local `<branch>` that already exists
   (`git show-ref --verify --quiet refs/heads/<branch>`); when it does not,
   use `git worktree add -b <branch> ../purosur.online.worktrees/<N>-<short-slug> origin/<branch>`
   instead.
   With a linked branch from step 4, `<short-slug>` is the part of its name
   after `<N>-`; when a worktree for it already exists (`git worktree list`),
   use that one. Copy the untracked local files `CLAUDE.local.md` and
   `.claude/settings.local.json` into the worktree when they exist, run
   `pnpm install` there, and continue the work in that worktree: move the
   session into it (`EnterWorktree` with its path) or open a new session
   there.
7. State plainly which commit type the eventual PR title must use, per the
   issue-type-to-commit-type mapping in `.claude/rules/workflow.md`, so later commits on
   this branch are consistent with it.
