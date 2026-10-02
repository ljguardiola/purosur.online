# Review checklist

Each area names where its rules are written and what part of the change to
read against them. Read the cited sections in full: the rules are there, not
here. A finding cites the written rule it breaks or the issue's
definition-of-done item; a finding that can cite neither is a correctness
finding or is not a finding.

| Area | Rules written in | Read in the change |
|---|---|---|
| Issue scope | `issue.md` in the review folder | Each definition-of-done item against what the change delivers, and anything the change does beyond the issue; an example the review itself added to this checklist is not work beyond the issue. |
| Correctness | — | What the changed code does with each input it can receive; code left without a reader by the change; tests that would still pass with the behavior they name removed. |
| Structure | `CONTRIBUTING.md`: "Structure" | The folder and file of every added or moved piece of code, including additions to files every feature passes through. |
| Business rules and boundaries | `CONTRIBUTING.md`: "Business rules and boundaries", "Operations" | Every added condition, constant, computation and query: which layer decides it, and whether `packages/domain` already has a predicate or value that answers it (search before accepting new logic); what each route handler and core request handler does; what each screen and `packages/contracts` file imports from `packages/domain`; every entry added to a guard's allowlist, and every import a change adds to a file an allowlist lists. |
| Application stack | `CONTRIBUTING.md`: "Application stack" | How each read, form, list, navigation and piece of screen state is built, and every dependency added, replaced or removed. |
| Screens | `CONTRIBUTING.md`: "Backoffice screens", "Register screens", "React code"; `.claude/skills/build-screen/SKILL.md` | Every state a changed screen can be in and the piece that shows it, its file kinds and names, and what each component reads while rendering. |
| User-facing text | `CONTRIBUTING.md`: "User-facing text" | Every added or changed Spanish text, read in the screen where it appears. |
| Comments | `CONTRIBUTING.md`: "Code style" | Every added or changed comment, in code, tests, scripts and configuration. |
| Commit order | `CONTRIBUTING.md`: "Code style" | `commits.patch` (in a re-review, `delta-commits-<round>.patch`) commit by commit: for each commit that changes behavior, the earlier test commit of that behavior. See "Commit order" below. |
| Testing and migrations | `CONTRIBUTING.md`: "Testing" | Which kind of test owns each new rule, how each test controls time, and every added or changed migration. |
| Data | `CONTRIBUTING.md`: "Code style" | Every sample, fixture and test value that names a person, business, tax id or credential. |
| Process | `CONTRIBUTING.md`: "Branches and pull requests", "Code style", "Checks"; `CLAUDE.md` | Language of code and text, comments that switch off a check, every changed workflow, and a skill, agent or checklist line that restates a rule from `CONTRIBUTING.md` or holds a rule `CONTRIBUTING.md` does not. |

## Commit order

Each commit in `commits.patch` lists its files under its message, then its
diff. A moved or renamed piece of code shows as a rename in that list, or as
removed in one file and added unchanged in another; a change that keeps
behavior leaves what every test of the touched files asserts as it was.

A behavior commit with no earlier test commit of that behavior is a `rule`
finding that names the commit's short sha and the behavior, as an input and
its outcome. It is resolved by a later commit holding the behavior's test,
proven to fail with the behavior commit reversed, or by such a test the
branch already has. A re-review does not reopen it because the history still
shows the code first.

## Kinds

- `rule`: the change breaks a written rule. Fixed.
- `correctness`: the change behaves wrongly for an input it can receive, or leaves code no reader uses. Fixed.
- `scope`: a definition-of-done item the change does not deliver, or work beyond the issue. Fixed by delivering it or removing the extra work.
- `decision`: the change replaces or drops a library of the confirmed stack, adds a library for something the stack already covers, or contradicts a written rule on purpose (applied across the change, or a choice its pull request would state under "Technical decisions"). Adding a library the stack names is not a decision. The review stops on it.
