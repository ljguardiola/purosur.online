# Review checklist

Each area names where its rules are written and what part of the change to
read against them. Read the cited sections in full: the rules are there, not
here. A finding cites the written rule it breaks or the issue's
definition-of-done item; a finding that can cite neither is a correctness
finding or is not a finding.

| Area | Rules written in | Read in the change |
|---|---|---|
| Issue scope | `issue.md` in the review folder | Each definition-of-done item against what the change delivers, and anything the change does beyond the issue; an example the review itself added to this checklist is not work beyond the issue. Examples: a path-scoped rule file that another rule file sends to, where the two files' `paths:` do not overlap; a file split by topic that still holds two unrelated former sections under separate top-level headings; a path-scoped rule whose trigger can happen without reading a matching file (such as `pnpm add` changing a `package.json`). |
| Correctness | — | What the changed code does with each input it can receive; code left without a reader by the change; tests that would still pass with the behavior they name removed. Example: a message the core now checks against a stricter contracts shape than the reader it replaced, so stored data that reader accepted (such as installation keys the domain refuses, read back from a corrupted credentials file) gets a different outcome; a static check that misses a place ordinary code puts its input, such as a query key given as a parameter's default value, passed as a JSX attribute, fed to a typed inline callback or handed by name to a callback (`keys.forEach(invalidate)`), or built first as an argument object in an unannotated const or spread into JSX props; a static check that refuses a correct key read back through a library-typed property (`queryOptions(...).queryKey`) or from a non-destructured parameter (`props.source`); a check of a folder convention that treats every top-level folder as a concept, accepting in `shell/` or `platform/` what it refuses at the source root; a guard no input can reach; a static check that refuses a correct key written beside a spread of an object whose type has no key, or misses a key a later spread overrides (`{ key: [...], ...base }`), or refuses a key forwarded through a rest element spread into JSX. A static check covers the routes ordinary code takes: a finding that exists only in code written to get past the check, such as a module loaded at run time or a value reached by reflection, is not a correctness finding of the check. |
| Structure | `.claude/rules/structure.md`: "Structure" | The folder and file of every added or moved piece of code, including additions to files every feature passes through. Example: a piece moved into `platform/` or `shell/` that the screens of only one concept use, such as the register's PIN authorization section and its authorizers query used only by the cash-movement modal. |
| Business rules and boundaries | `.claude/rules/boundaries.md`: "Business rules and boundaries", "Operations" | Every added condition, constant, computation and query: which layer decides it, and whether `packages/domain` already has a predicate or value that answers it (search before accepting new logic); what each route handler and core request handler does, and in every changed cloud operation what runs before its session, fresh-authorization and permission checks (such as `findBranchUser` answering 404 before `requirePasskeyAuthorization`) and whether its scope is a filter of the query or a comparison after a lookup; what each screen and `packages/contracts` file imports from `packages/domain`; every entry added to a guard's allowlist, and every import a change adds to a file an allowlist lists. |
| Application stack | `.claude/rules/application-stack.md`: "Application stack" | How each read, form, list, navigation and piece of screen state is built, and every dependency added, replaced or removed. |
| Screens | `.claude/rules/backoffice-screens.md`: "Backoffice screens"; `.claude/rules/register-screens.md`: "Register screens"; `.claude/rules/react.md`: "React code"; `.claude/skills/build-screen/SKILL.md` | Every state a changed screen can be in and the piece that shows it, its file kinds and names, and what each component reads while rendering. A `platform/` or `packages/ui` piece that a rule in `.claude/rules/` names, renamed, replaced or deleted while the rule still names it. |
| User-facing text | `.claude/rules/user-facing-text.md`: "User-facing text" | Every added or changed Spanish text, read in the screen where it appears. |
| Comments | `.claude/rules/code-style.md`: "Code style" | Every added or changed comment, in code, tests, scripts and configuration. |
| Commit order | `.claude/rules/code-style.md`: "Code style" | `commits.patch` (in a re-review, `delta-commits-<round>.patch`) commit by commit: for each commit that changes behavior, the earlier test commit of that behavior, and what else each test commit holds. Example: a test commit that also moves a production file while its importer changes only in the later code commit, so the repository does not type-check at the test commit; a branch a code commit adds that no earlier test commit states, so deleting it keeps every test green (such as accepting an interface's property signature as a type-only reference); a branch a code commit removes, so an input gets a new outcome no test commit states (such as a template-literal root refused as unreadable, or a `new` argument no longer checked). See "Commit order" below. |
| Testing and migrations | `.claude/rules/testing.md`: "Testing" | Which kind of test owns each new rule, how each test controls time, and every added or changed migration. |
| Data | `.claude/rules/code-style.md`: "Code style" | Every sample, fixture and test value that names a person, business, tax id or credential. |
| Process | `.claude/rules/workflow.md`: "Branches and pull requests"; `.claude/rules/code-style.md`: "Code style"; `.claude/rules/checks.md`: "Checks"; `CLAUDE.md` | Language of code and text, comments that switch off a check, every changed workflow, and a line in a skill, an agent or this checklist that restates or contradicts a rule in `.claude/rules/`. |

## Commit order

Each commit in `commits.patch` lists its files under its message, then its
diff. A moved or renamed piece of code shows as a rename in that list, or as
removed in one file and added unchanged in another; a change that keeps
behavior leaves what every test of the touched files asserts as it was.

A behavior commit with no earlier test commit of that behavior is a `rule`
finding that names the commit's short sha and the behavior, as an input and
its outcome. It is resolved as the commit-order rule in `.claude/rules/code-style.md`
("Code style") says, so a re-review does not reopen it because the history
still shows the code first.

## Kinds

- `rule`: the change breaks a written rule. Fixed.
- `correctness`: the change behaves wrongly for an input it can receive, or leaves code no reader uses. Fixed.
- `scope`: a definition-of-done item the change does not deliver, or work beyond the issue. Fixed by delivering it or removing the extra work.
- `decision`: the change replaces or drops a library of the confirmed stack, adds a library for something the stack already covers, or contradicts a written rule on purpose (applied across the change, or a choice its pull request would state under "Technical decisions"). Adding a library the stack names is not a decision. The review stops on it.
