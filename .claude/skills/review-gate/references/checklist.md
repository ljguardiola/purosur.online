# Review checklist

Each area names where its rules are written and what part of the change to
read against them. Read the cited sections in full: the rules are there, not
here. A finding cites the written rule it breaks or the issue's
definition-of-done item; a finding that can cite neither is a correctness
finding or is not a finding.

| Area | Rules written in | Read in the change |
|---|---|---|
| Issue scope | `issue.md` in the review folder | Each definition-of-done item against what the change delivers, and anything the change does beyond the issue. |
| Correctness | — | What the changed code does with each input it can receive; code left without a reader by the change; tests that would still pass with the behavior they name removed. |
| Structure and architecture | `CONTRIBUTING.md`: "Structure", "Operations" | The folder and file of every added or moved piece of code, including additions to files every feature passes through; where each business decision, wire shape and database query lives; what each route handler does; what each screen imports. |
| Application stack | `CONTRIBUTING.md`: "Application stack" | How each read, form, list, navigation and piece of screen state is built, and every dependency added, replaced or removed. |
| Screens | `CONTRIBUTING.md`: "Backoffice screens", "Register screens", "React code"; `.claude/skills/build-screen/SKILL.md` | Every state a changed screen can be in and the piece that shows it, its file kinds and names, and what each component reads while rendering. |
| User-facing text | `CONTRIBUTING.md`: "User-facing text" | Every added or changed Spanish text, read in the screen where it appears. |
| Comments | `CONTRIBUTING.md`: "Code style" | Every added or changed comment, in code, tests, scripts and configuration. |
| Testing and migrations | `CONTRIBUTING.md`: "Testing" | Which kind of test owns each new rule, how each test controls time, and every added or changed migration. |
| Data | `CONTRIBUTING.md`: "Code style" | Every sample, fixture and test value that names a person, business, tax id or credential. |
| Process | `CONTRIBUTING.md`: "Branches and pull requests", "Code style", "Checks"; `CLAUDE.md` | Language of code and text, comments that switch off a check, and every changed workflow. |

## Kinds

- `rule`: the change breaks a written rule. Fixed.
- `correctness`: the change behaves wrongly for an input it can receive, or leaves code no reader uses. Fixed.
- `scope`: a definition-of-done item the change does not deliver, or work beyond the issue. Fixed by delivering it or removing the extra work.
- `decision`: the change replaces or drops a library of the confirmed stack, adds a library for something the stack already covers, or contradicts a written rule on purpose (applied across the change, or a choice its pull request would state under "Technical decisions"). Adding a library the stack names is not a decision. The review stops on it.
