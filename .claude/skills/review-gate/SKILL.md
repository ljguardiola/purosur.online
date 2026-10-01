---
name: review-gate
description: Run the repository's own pre-PR review of an issue branch - two blind reviewers check the change against the rules written in the repository, a verifier proves or refutes every finding, a fixer fixes every confirmed in-scope one, and rounds repeat until none is left. Use after the issue's work is committed and before the single full pnpm verify.
---

The rules a change is reviewed against are the ones written in the
repository: `CONTRIBUTING.md`, `CLAUDE.md`, the skills under `.claude/skills/`
and the issue the branch closes. This skill sequences the review; it never
restates those rules. Where in `CONTRIBUTING.md` each area lives is mapped in
[references/checklist.md](references/checklist.md); the reviewer, verifier
and fixer reports are shaped as in
[references/formats.md](references/formats.md).

The parent session runs every step below. The agents never launch other
agents, and only the fixer edits files.

## 1. Freeze the target

1. Every change of the issue is committed and `git status` is clean.
2. `BASE` is `git merge-base origin/main HEAD`; `TARGET` is `git rev-parse HEAD`.
3. The review folder is `$(git rev-parse --git-path review-gate)`, outside the
   tracked tree. Write into it:
   - `issue.md`: `gh issue view <N> --json title,body,labels`;
   - `change.patch`: `git diff BASE TARGET`;
   - `ledger.md`: the findings ledger, empty at first.
4. Nothing is edited until the round's verdicts are in.

## 2. Review

Launch `review-gate-reviewer` twice in parallel, as reviewer A and reviewer B,
with the same prompt: the review folder, `BASE`, `TARGET`, and whether this
is the first round or a re-review. Neither sees the other's result. Wait for
both.

- First round: the whole change, against every area of the checklist.
- Re-review: only the fix delta (`git diff <previous TARGET> <new TARGET>`,
  written to `delta-<round>.patch`) and the ledger. The reviewers check that
  each fixed finding is really resolved and look for defects the fixes
  introduced; they do not review the rest of the change again.

## 3. Merge the ledger

Merge both results into `ledger.md`: one row per distinct finding, an id
`R<round>-<n>`, which reviewer raised it (`A`, `B` or `A+B`), and the
reviewer's kind and rule reference. A finding raised by one reviewer only is
as valid as one raised by both. Severity labels never decide anything.

## 4. Verify

Launch `review-gate-verifier` once with the review folder and the ledger
rows of this round. It returns, per id, `CONFIRMED` or `REFUTED` with its
evidence, and `in-scope` or `out-of-scope` against the issue. Copy its
verdicts into the ledger.

## 5. Decide

| Verdict | Action |
|---|---|
| A confirmed finding of kind `decision` (the change replaces or drops a library of the confirmed stack, or deliberately contradicts a written rule) | Stop the review. Report it to the coordinator; nothing is fixed and the review does not approve it. |
| Confirmed, in scope | Fix it, whatever its label. |
| Confirmed, out of scope | Report it to the coordinator as a proposed new issue: title, what and why, evidence. Not fixed here. |
| Refuted | Record the evidence that refutes it. Not fixed. |

The coordinator is whoever assigned the issue: the coordinating session, or
the owner when no session coordinates.

## 6. Fix

When at least one confirmed in-scope finding is open, launch
`review-gate-fixer` with the review folder and those ledger ids. It fixes
them in the TDD order in `CONTRIBUTING.md`, runs the focused tests of the
files it touched, and reports per id. Then commit the fixes in one commit
(`<type>: address review-gate round <n> findings`, with the issue's commit
type) and go back to step 2 as a re-review with that commit as the new
`TARGET`.

There is no round limit: rounds repeat until a re-review leaves no confirmed
in-scope finding. When a re-review confirms again a finding a fix claimed to
close, the next fix takes a different approach and says why the previous one
failed.

## 7. Result

End with exactly one line, which the pull request's "How it was tested" cites:

```
REVIEW-GATE: CLEAN — <rounds> rounds, <fixed> fixed, <refuted> refuted, <reported> reported out of scope (TARGET <sha>)
REVIEW-GATE: STOPPED — <ledger id>: <the decision that needs the coordinator>
```

Then report the out-of-scope findings and any stop to the coordinator.
