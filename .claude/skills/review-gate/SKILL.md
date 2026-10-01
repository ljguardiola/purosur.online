---
name: review-gate
description: Run the repository's own pre-PR review of an issue branch - two blind reviewers check the change against the rules written in the repository, a verifier proves or refutes every finding, a fixer fixes every confirmed in-scope one, and rounds repeat until none is left. Use after the issue's work is committed and before the single full pnpm verify.
---

The rules a change is reviewed against are the ones written in the
repository: `CONTRIBUTING.md`, `CLAUDE.md`, the skills under `.claude/skills/`
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
   - `issue.md`: `gh issue view <N> --json title,body,labels`;
   - `change.patch`: `git diff BASE TARGET`;
   - `ledger.md`: the findings ledger, created empty on the first run and
     kept across every later round and resumed run.
4. Nothing is edited until the round's verdicts are in.

## 2. Review

Launch `review-gate-reviewer` twice in parallel, as reviewer A and reviewer B,
with the same prompt: the review folder, `BASE`, `TARGET`, the round, and for
a re-review the delta file. Neither sees the other's result. Wait for both.

- First round, and the round after a `decision`: the whole change, against
  every area of the checklist.
- Re-review: only the fix delta (`git diff <previous TARGET> <new TARGET>`,
  written to `delta-<round>.patch`) and the ledger. The reviewers check that
  each fixed finding is really resolved and look for defects the fixes
  introduced; they do not review the rest of the change again.

## 3. Merge the ledger

Merge both results into `ledger.md`: one row per distinct finding, an id
`R<round>-<n>`, which reviewer raised it (`A`, `B` or `A+B`), and its kind
and rule reference. A finding raised by one reviewer only is as valid as one
raised by both. A re-review finding that a row marked fixed is not resolved
reopens that row instead of adding one, and its fix counts as a failed
attempt.

## 4. Verify

Launch `review-gate-verifier` once with the review folder and the ids of this
round. It returns, per id, `CONFIRMED` or `REFUTED` with its proof, the kind
it settles on, and `in-scope` or `out-of-scope`. Copy its verdicts into the
ledger.

## 5. Decide

| Verdict | Action |
|---|---|
| Confirmed, kind `decision` | Mark it `stopped` and stop the review: report it to the coordinator with its evidence. Nothing is fixed and the review does not approve it. |
| Confirmed, in scope, any other kind | Fix it, whatever its label. |
| Confirmed, out of scope | File it as a new issue following "Issues" in `CONTRIBUTING.md`, and report its number to the coordinator. Not fixed here. |
| Refuted | Record the proof that refutes it. Not fixed. |

The coordinator is whoever assigned the issue: the coordinating session, or
the owner when no session coordinates. Once the coordinator answers a
`stopped` row, the review resumes at step 6 with that row `open` and the
answer attached: for an approved `decision`, the fix updates the written rule
it contradicted in the same change; for a rejected one, it undoes the
decision; for a row no fix could close, it follows the coordinator's answer.
After a `decision`, the next round reviews the whole change again
(`change.patch` from `BASE` to the new `TARGET`), not only the fix delta.

## 6. Fix

Launch `review-gate-fixer` with the review folder and every confirmed
in-scope id whose status is `open`, with the previous fixer report of any id
it already tried. It reports each id `fixed` or `not fixed` with the reason.

- When it fixed at least one: commit them in one commit
  (`<type>: address review-gate round <n> findings`, with the issue's commit
  type), mark those rows `fixed in <sha>`, and go back to step 2 as a
  re-review with that commit as the new `TARGET`.
- A row reported `not fixed`, or reopened by a re-review, stays `open` with
  the reason in the ledger and goes to the next fixer launch, which takes a
  different approach. A row two failed attempts could not close is marked
  `stopped` and stops the review: report it to the coordinator.

There is no round limit. The review is clean when no confirmed in-scope row
is `open` and the last review round, first or re-review, confirmed no new
in-scope finding.

## 7. Result

End with exactly one line, which the pull request's "How it was tested" cites:

```
REVIEW-GATE: CLEAN — <rounds> rounds, <fixed> fixed, <refuted> refuted, <filed> filed as new issues (TARGET <sha>)
REVIEW-GATE: STOPPED — <ledger id>: <the decision, or the finding no fix could close>
```

Then report the new issues and any stop to the coordinator.
