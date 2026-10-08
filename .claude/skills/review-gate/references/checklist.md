# Review checklist

Each area names where its rules are written and what part of the change to
read against them. Read the cited sections in full: the rules are there, not
here. A finding cites the written rule it breaks or the issue's
definition-of-done item; a finding that can cite neither is a correctness
finding or is not a finding.

| Area | Rules written in | Read in the change |
|---|---|---|
| Issue scope | `issue.md` in the review folder | Each definition-of-done item against what the change delivers, and anything the change does beyond the issue. |
| Correctness | — | What the changed code does with each input it can receive; code left without a reader by the change; tests that would still pass with the behavior they name removed. A route to what a check over the source refuses is judged by "Checks" in `.claude/rules/checks.md`: one only code written to get past the check takes is no finding of the check, and such code in the change is a `rule` finding against that code. |
| Structure | `.claude/rules/structure.md`: "Structure" | The folder and file of every added or moved piece of code, including additions to files every feature passes through. |
| Business rules and boundaries | `.claude/rules/boundaries.md`: "Business rules and boundaries", "Operations" | Every added condition, constant, computation and query: which layer decides it, and whether `packages/domain` already has a predicate or value that answers it (search before accepting new logic); what each route handler and core request handler does, and in every changed cloud operation what runs before its session, fresh-authorization and permission checks and whether its scope is a filter of the query or a comparison after a lookup; what each screen and `packages/contracts` file imports from `packages/domain`. |
| Application stack | `.claude/rules/application-stack.md`: "Application stack" | How each read, form, list, navigation and piece of screen state is built, and every dependency added, replaced or removed. |
| Screens | `.claude/rules/backoffice-screens.md`: "Backoffice screens"; `.claude/rules/register-screens.md`: "Register screens"; `.claude/rules/react.md`: "React code"; `.claude/skills/build-screen/SKILL.md` | Every state a changed screen can be in and the piece that shows it, its file kinds and names, and what each component reads while rendering. A `platform/` or `packages/ui` piece that a rule in `.claude/rules/` names, renamed, replaced or deleted while the rule still names it. |
| User-facing text | `.claude/rules/user-facing-text.md`: "User-facing text" | Every added or changed Spanish text, read in the screen where it appears, and every unchanged one that names a cause or a state the change made impossible. |
| Comments | `.claude/rules/code-style.md`: "Code style" | Every added or changed comment, in code, tests, scripts and configuration, and every unchanged comment that states behavior the change alters. |
| Commit order | `.claude/rules/code-style.md`: "Code style" | `commits.patch` (in a re-review, `delta-commits-<round>.patch`) commit by commit: for each commit that changes behavior, the earlier test commit of that behavior, and what else each test commit holds. See "Commit order" below. |
| Testing and migrations | `.claude/rules/testing.md`: "Testing" | Which kind of test owns each new rule, how each test controls time, and every added or changed migration. |
| Data | `.claude/rules/code-style.md`: "Code style" | Every sample, fixture and test value that names a person, business, tax id or credential. |
| Process | `.claude/rules/workflow.md`: "Branches and pull requests"; `.claude/rules/code-style.md`: "Code style"; `.claude/rules/checks.md`: "Checks"; `CLAUDE.md` | Language of code and text, comments that switch off a check, every changed workflow, and a line in a skill, an agent or this checklist that restates or contradicts a rule in `.claude/rules/`. |

## Examples

Each example names one pattern of deviation, in general terms, with a case
or two that show it; an area with none is read from its rules alone.
"Growing the checklist" in `SKILL.md` bounds how many an area holds and says
how a new one is judged.

### Issue scope

- A definition-of-done item delivered for only part of what it names: one
  path where it asks for every form (a recorder that drives one flow while
  the register also sends a BUY_N_PAY_M promotion), a stand-in the test
  builds instead of the app's own code (a client with its own integration),
  or a field each reported item must carry that no step's output produces.
- A visible difference in a technical issue that the definition of done does
  not accept.
- A path-scoped rule file whose `paths:` miss where its rule applies: a file
  another rule file sends to with no overlapping paths, or a trigger that
  happens without reading a matching file (`pnpm add` changing a
  `package.json`).

### Correctness

- A check over the source that misses a route ordinary code takes to what it
  refuses (a re-export of the library's namespace, a parameter default, a
  JSX attribute or spread, a callback handed by name, a value cast with
  `as`), or refuses correct code that reads alike (another binding of the
  same library, a key read back through a library-typed property, a folder
  outside the concepts treated as one).
- A decision made from state that changed after it was read: an answer
  computed from the session before the operation changed it (`may_edit:
  true` to an Administrator who just left the role), a check made before the
  lock and never again under it, a second-submit guard that reads only the
  rendered `submitting`, so two quick presses both send.
- A failure path that loses what the failure says: a handler that replaces
  the error it caught, so its kind never reaches what reacts to it; a message
  template whose value renders empty; an outcome whose only feedback is a
  re-read that keeps the cached record when the re-read fails.
- A reading of outside data that changes what passes: a stricter shape in
  place of the reader it replaced, so stored data that reader accepted gets
  another outcome; a non-strict schema that drops the keys a comparison is
  meant to catch; a plain-object lookup of a received code that answers for
  `constructor`.
- A key wider or narrower than what it identifies: an alert deduplicated by
  a scope wider than what it flags, a recorded child row checked only by its
  foreign key, so it may name a parent of another record.

### Structure

- A piece placed for the wrong set of users: in `platform/` or `shell/` while
  one concept uses it, in one concept's folder while others import it from
  there, or copied into a second concept instead of moved.
- An aspect test file (`<name>.<aspect>.test.ts`) that copies the main test
  file's setup instead of sharing it through `test-support/<name>.ts`.

### Business rules and boundaries

- A screen deriving what the cloud or the core already answers: an action
  hidden from a row's flag (`isAdministrator`) while the cloud decides it
  with a domain predicate (`isRoleEditable`), a refund's state read from its
  method instead of its `state`, or a text naming one field from another
  field's value.
- A screen deciding about its own form through a contracts shape other than
  the one it validates the form with, or using a request shape's parse only
  as a yes/no while it sends a body built separately.
- A read of another concept declared as a port of the concept that needs it
  instead of a read port of its own concept.

### Screens

- A screen hand-writing what a `packages/ui` piece named in build-screen
  covers, such as a panel total as `Eyebrow` plus a `text-display` figure
  where `FigureStat` exists.
- A screen standing in for an answer it does not have: an action the cloud
  answers for shown disabled from a defaulted flag while the record loads, or
  a URL filter rewritten as not offered because its options failed to load.

### User-facing text

- English reaching the screen: a stored identifier shown as a value
  (`production`), or a cloud error's English text or a raw code interpolated
  into a Spanish sentence.
- A locked control left plainly disabled: its tooltip dropped while a
  refusal shows elsewhere, so the control itself no longer says why it is
  locked.

### Commit order

- A code commit whose behavior change reads as no change: a branch added or
  removed, a parameter type widened, a default value changed, so an input
  gets a new outcome no earlier test commit states.
- A commit holding more than its kind: a test commit that also moves a
  production file whose importer changes only later, or a commit presented
  as configuration that also deletes files other code still imports, so the
  repository does not type-check at it.
- A test commit whose test fails on its own setup rather than on the
  behavior, so the test that states the behavior arrives only with the code
  commit that fixes the setup.

### Testing and migrations

- A case tested above the level that owns it: an app part asserting a
  `packages/ui` piece's behavior beyond the props it wires, a route test
  repeating an adapter's integration case, a screen test repeating what a
  modal's or a helper's own test owns.
- A rule with no test at its own level: a domain predicate proven only
  through use cases, a shared helper tested only through its callers, or a
  query hook only through its screen.
- A test whose outcome depends on timing it does not control: a baseline
  taken while the app it started may still be working, a wait ended only by
  events a broken run may never raise, a short client timeout in a shared
  helper that answered cases meet only in real time.

### Data

- A fixture recorded from a real service that keeps an identity its scrubber
  does not name, such as an `O=` legal name when only `CN=` is replaced.

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
