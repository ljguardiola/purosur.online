# Report formats

## Reviewer result

One JSON object and nothing else:

```json
{
  "findings": [
    {
      "location": "path:line or path:start-end",
      "kind": "rule | correctness | scope | decision",
      "rule": ".claude/rules/<file>.md \"Section\" — the sentence broken, or the issue's definition-of-done item",
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
copy). The kinds are defined in `checklist.md`. A clean result is
`{"findings": [], "inspected": [...]}`.

## Ledger

`ledger.md` in the review folder, one table per round:

```markdown
## Round <n> — TARGET <sha>

| Id | Raised by | Kind | Location | Claim | Verdict | Scope | Evidence | Failed attempts | Status |
|---|---|---|---|---|---|---|---|---|---|
| R1-1 | A+B | rule | path:line | ... | CONFIRMED | in-scope | ... | 0 | fixed in <sha> |
```

`Status` is `open` (with the reason of each `not fixed` attempt),
`fixed in <sha>`, `refuted`, `filed as #<n>` (out of scope) or `stopped` (a
`decision` waiting for the coordinator, or a row two failed attempts could
not close).

After the rounds, one section keeps every proposed checklist example across
rounds and resumed runs:

```markdown
## Proposed checklist examples

| Id | Area | Example | Reported |
|---|---|---|---|
| R1-1 | Correctness | ... | yes |
```

## Verifier verdict

One block per ledger id:

```markdown
### R1-1 — CONFIRMED | REFUTED — <kind> — in-scope | out-of-scope
- Proof: the command run and its observed result (a mutation and the focused test's outcome), or the rule text and the code lines compared.
- Restored: `git status` clean after the proof (behavioral claims only).
- Checklist: for a confirmed finding, the area of `checklist.md` it was judged against, then one of: `named` when an example of that area names its pattern; `check` with what a check of `pnpm verify` would refuse; `one-off`; or `not named` with the proposed example, written as the bullet it would be under that area in "Examples", and the example it merges with or replaces when the area already holds five.
```

## Fixer report

One block per ledger id:

```markdown
### R1-1 — fixed | not fixed
- Change: path:line and what changed.
- Test: the test written or changed first and its observed failure, then the passing run; or none, when the fix changes nothing a test can observe.
- Previous attempt: for an id already tried, why that approach failed and how this one differs.
- Mutation: for a change to `packages/domain` or `packages/contracts`, the scoped mutation run and its survivors (none).
- Not fixed: the reason, when the fix could not be made.
- Focused run: the command and its result.
```

## Checklist proposal

One block per proposed example, reported to the coordinator:

```markdown
### Checklist proposal — <area from the verifier's verdict> — from <id> of issue #<N>
- Finding: the ledger row's kind, rule reference and claim.
- Example: the bullet to add under the area in "Examples" of `checklist.md`, pasted as is, and the example it merges with or replaces when the area already holds five; or, for a `check` verdict, Check: what a check of `pnpm verify` would refuse.
```
