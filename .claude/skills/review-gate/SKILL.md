---
name: review-gate
description: Run the repository's own pre-PR review of an issue branch - two blind reviewers check the change against the rules written in the repository, a verifier proves or refutes every finding, a fixer fixes every confirmed in-scope one, and rounds repeat until none is left. Use after the issue's work is committed and before the single full pnpm verify.
---

The rules a change is reviewed against are the ones written in the
repository: the files in `.claude/rules/`, `CLAUDE.md`, the skills under `.claude/skills/`
and the issue the branch closes. This skill sequences the review; it never
restates those rules. Which sections each area of the review reads is mapped
in [references/checklist.md](references/checklist.md); the reports and the
ledger are shaped as in [references/formats.md](references/formats.md).

The parent session runs every step below; the agents never launch other
agents. Only the fixer changes the code; the verifier's temporary edits are
undone before it answers.

## 1. Freeze the target

1. Every change of the issue is committed and `git status` is clean.
2. `BASE` is `git merge-base origin/main HEAD`; `TARGET` is `git rev-parse HEAD`.
3. The review folder is `$(git rev-parse --path-format=absolute --git-path review-gate)`,
   outside the tracked tree. Write into it:
   - `issue.md`: `gh issue view <N> --json title,body,labels`. The issue is
     the review's only source of scope: when whoever assigned it widened or
     narrowed the work, its definition of done is updated on GitHub first;
   - `change.patch`: `git diff BASE TARGET`;
   - `commits.patch`: `git log --reverse --no-merges --stat --patch BASE..TARGET`,
     the branch's own commits in the order they were made, each with its
     files and diff. Merge commits, such as the ones that take `main`'s
     changes, are left out;
   - `ledger.md`: the findings ledger, created empty on the first run and
     kept across every later round and resumed run.
4. Nothing is edited until the round's verdicts are in.

## 2. Review

Launch `review-gate-reviewer` twice in parallel, as reviewer A and reviewer B,
with the same prompt: the review folder, `BASE`, `TARGET`, the round, and for
a re-review the delta files `delta-<round>.patch` and
`delta-commits-<round>.patch`. Neither sees the other's result. Wait for both.

- First round: the whole change, against every area of the checklist.
- Re-review: only the fix delta (`git diff <previous TARGET> <new TARGET>`,
  written to `delta-<round>.patch`, and its commits,
  `git log --reverse --no-merges --stat --patch <previous TARGET>..<new TARGET>`,
  written to `delta-commits-<round>.patch`) and the ledger. The reviewers check that
  each fixed finding is really resolved and look for defects the fixes
  introduced; they do not review the rest of the change again.

## 3. Merge the ledger

Merge both results into `ledger.md`: one row per distinct finding, an id
`R<round>-<n>`, which reviewer raised it (`A`, `B` or `A+B`), and its kind
and rule reference. A finding raised by one reviewer only is as valid as one
raised by both. A re-review finding that a row marked fixed is not resolved
keeps that row's id instead of adding one.

## 4. Verify

Launch `review-gate-verifier` once with the review folder and the ids of this
round, including the rows a re-review says are not resolved. It returns, per
id, `CONFIRMED` or `REFUTED` with its proof, the kind it settles on, and
`in-scope` or `out-of-scope`. Record each verdict and its proof in the ledger.

## 5. Classify

Every row has a status and a count of failed fix attempts. Apply each verdict
of this round:

| Verdict | Status |
|---|---|
| New finding, refuted | `refuted` |
| New finding, confirmed, kind `decision` | `stopped` |
| New finding, confirmed, out of scope | file it as a new issue following "Issues" in `.claude/rules/workflow.md`; `filed as #<n>` |
| New finding, confirmed, in scope, any other kind | `open`, whatever its label |
| Reopen claim on a `fixed in <sha>` row, refuted | unchanged |
| Reopen claim on a `fixed in <sha>` row, confirmed | `open`, one more failed attempt |

Then every `open` row with two failed attempts becomes `stopped`.

## 6. Fix

While a row is `open`, launch `review-gate-fixer` with the review folder and
every `open` id, with the previous fixer report of any id it already tried
and the coordinator's answer of any id that had one. It reports each id
`fixed` or `not fixed` with the reason.

- Each `not fixed` row keeps `open` and counts one more failed attempt; with
  two it becomes `stopped`.
- When it fixed at least one row: commit the test files the fixer wrote or
  changed first, on their own (`<type>: add failing tests for review-gate
  round <n> findings`, with the issue's commit type), then the rest of the
  fix (`<type>: address review-gate round <n> findings`); a fix with no test,
  or with only tests, is one commit. Mark those rows `fixed in <sha>` with the
  sha of the commit that closes each one, and go to step 2 as a re-review
  with the last commit as the new `TARGET`, whatever else is `open` or
  `stopped`.
- A row the fixer closed by proving that a test the branch already has fails
  without the implementation, with no change, is `fixed in <sha>` with the
  sha of the commit that holds that test, even when that is the commit the
  row names. A commit-order row is resolved as the commit-order rule in
  `.claude/rules/code-style.md` ("Code style") says, not reopened for the history itself.
- A round whose fixes changed no file commits nothing and needs no
  re-review.
- When it fixed none and a row is still `open`, launch the fixer again; the
  next launch takes a different approach.

There is no round limit. Step 7 is reached only when no row is `open` and
every fix commit has been re-reviewed.

## 7. Result

When a row is `stopped`, end with

```
REVIEW-GATE: STOPPED — <each stopped id>: <the decision, or the finding no fix could close>
```

and report every stopped row to the coordinator: whoever assigned the issue,
the coordinating session or the owner when no session coordinates. Record
each answer in the ledger and set the row's status from it:

- an approved `decision`: `open`, to update the written rule it contradicted
  in the same change;
- a rejected `decision`: `open`, to undo it;
- a row no fix could close: `open` when the answer says how to fix it, with
  its failed attempts reset; `filed as #<n>` when the answer moves it out of
  the issue; `fixed in <sha>` when the answer names a later fix commit that
  already closed it, provided that commit has been re-reviewed and a test or
  proof in it covers the row's input.

Then go to step 6.

When no row is `stopped`, every row is `refuted`, `filed as #<n>` or
`fixed in <sha>`, and the review ends with the line the pull request's
"How it was tested" cites:

```
REVIEW-GATE: CLEAN — <rounds> rounds, <fixed> fixed, <refuted> refuted, <filed> filed as new issues (TARGET <sha>)
```

Report the new issues to the coordinator.

## Growing the checklist

When the verifier reports that a confirmed `rule` finding's kind of
deviation is not named in its area of
[references/checklist.md](references/checklist.md), add it to that area's
"Read in the change" as an example, in the round's fix commit. When the
round has none, commit the example on its own and go to step 2 with that
commit as the new `TARGET`, re-reviewed like a fix commit.
