# Report formats

## Reviewer result

One JSON object and nothing else:

```json
{
  "findings": [
    {
      "location": "path:line or path:start-end",
      "kind": "rule | correctness | scope | decision",
      "rule": "CONTRIBUTING.md \"Section\" — the sentence broken, or the issue's definition-of-done item",
      "claim": "what is wrong, as observable fact",
      "behavioral": true,
      "evidence": "the lines read and why they break the rule; for a behavioral claim, the input and the wrong outcome"
    }
  ],
  "inspected": ["what was read"]
}
```

`behavioral` is `true` when the claim is about what the code does when it
runs (a wrong result, an unhandled case, a test that does not discriminate),
and `false` when it is about what the code is (placement, naming, a comment,
copy). A clean result is `{"findings": [], "inspected": [...]}`.

## Ledger

`ledger.md` in the review folder, one table per round:

```markdown
## Round <n> — TARGET <sha>

| Id | Raised by | Kind | Location | Claim | Verdict | Scope | Evidence | Status |
|---|---|---|---|---|---|---|---|---|
| R1-1 | A+B | rule | path:line | ... | CONFIRMED | in-scope | ... | fixed in <sha> |
```

`Status` is `open`, `fixed in <sha>`, `refuted`, `reported` (out of scope,
sent to the coordinator) or `stopped` (a `decision` finding).

## Verifier verdict

One block per ledger id:

```markdown
### R1-1 — CONFIRMED | REFUTED — in-scope | out-of-scope
- Proof: the command run and its observed result (a mutation and the focused test's outcome), or the rule text and the code lines compared.
- Restored: `git status` clean after the proof (behavioral claims only).
```

## Fixer report

One block per ledger id:

```markdown
### R1-1 — fixed | not fixed
- Change: path:line and what changed.
- Test: the failing test written first and its observed failure, then the passing run; or why the finding needs no test (a comment, copy, placement).
- Focused run: the command and its result.
```
