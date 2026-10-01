# Review checklist

Each area names where its rules are written. A finding cites the written rule
it breaks (`CONTRIBUTING.md` section, skill, or the issue); a finding that can
cite no written rule is a correctness finding or is not a finding. Read the
cited section in full before judging the change against it.

| Area | Where the rules are written | Look for in the change |
|---|---|---|
| Issue scope | `issue.md` in the review folder | Every definition-of-done item delivered; nothing beyond the issue's problem. Gaps the code already had elsewhere are out of scope unless the change made them worse. |
| Correctness | — | Wrong behavior, unhandled outcomes, races, edge cases of the change's own inputs; dead bindings left behind after an edit; a test that would still pass with the behavior it names removed. |
| Structure and architecture | `CONTRIBUTING.md`: "Structure", "Operations" | Code placed in its business-concept folder, not piled into a central or shell file a concept folder fits; rules in `packages/domain`, wire shapes in the `packages/contracts` folder of their concept; a state change split into use case, ports and adapter; where cloud reads go; route handlers only translate. |
| Application stack | `CONTRIBUTING.md`: "Application stack" | Reads, forms, lists, navigation and screen state built with the confirmed library for each; no hand-written replacement and no second copy of core data in a screen. A library of the stack replaced or dropped is a finding of kind `decision`. |
| Screens | `CONTRIBUTING.md`: "Backoffice screens", "Register screens", "React code"; `.claude/skills/build-screen/SKILL.md` | Every state (loading, empty, failure, refresh, action outcome) shown with its `packages/ui` piece; no hand-written control where `packages/ui` has one; file kinds and names; Rules of React a linter does not catch, such as reading the clock while rendering. |
| User-facing text | `CONTRIBUTING.md`: "User-facing text" | Spanish copy that follows each rule there; a label read with its value as one sentence. |
| Comments | `CONTRIBUTING.md`: "Code style" | Every added or changed comment, in code, tests and scripts, against the comment rule and its examples. |
| Testing | `CONTRIBUTING.md`: "Testing" | Each rule tested once, at the lowest level that proves it, by its owning kind of test; no real-time waits; no test repeating a configuration value; behavior described without external references. |
| Migrations | `CONTRIBUTING.md`: "Testing" | Never an edited or deleted migration; a new cloud one dated after every one on `main`; each new one tested against data in the previous schema. |
| Sample and test data | `CONTRIBUTING.md`: "Code style" | Fictional values only; never a real tax id, certificate, person or business. |
| Process | `CONTRIBUTING.md`: "Branches and pull requests", "Working on an issue", "Code style", "Checks"; `CLAUDE.md` | Language of code and text, tests written before the code they prove, scoped mutation run for `packages/domain` and `packages/contracts`, pinned actions and job time limits, no comment that switches off a check. |

A change that replaces or drops a library of the confirmed stack, or
contradicts a written rule on purpose (a dependency added or removed, a
pattern applied across the change, a choice its pull request would state
under "Technical decisions"), is a finding of kind `decision`: the review
stops on it instead of fixing it. A rule broken by accident is of kind
`rule` and is fixed.
