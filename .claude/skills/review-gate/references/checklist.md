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
| Structure | `.claude/rules/structure.md`: "Structure" | The folder and file of every added or moved piece of code, including additions to files every feature passes through. Every added or moved source file of `packages/domain` is placed in the concept its rule belongs to, judged against every top-level folder of `packages/domain/src`, empty ones included, never accepted because files of the same theme already sit beside it; a file already in the wrong concept before the change is out of scope and becomes a new issue. |
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

- A check over the source out of step with what it judges: it misses a
  route ordinary code takes to what it refuses (a re-export of the library's
  namespace); it refuses correct code that reads alike or that its own hint
  suggests (a renumbering hint that sorts before the last migration); or it
  is narrowed while its own test still expects the removed cases to pass.
- A decision made from state other than the one in effect when it applies:
  an answer computed from the session before the operation changed it
  (`may_edit: true` to an Administrator who just left the role), a check
  made before the lock and never again under it, or rows locked in the
  opposite order of another operation that touches them.
- A failure path out of step with what failed: a handler that replaces the
  error it caught, so its kind never reaches what reacts to it; an outside
  call whose outcome is unknown (a timeout) recorded as one that did nothing;
  or one item's error that stops a sweep over many (or a housekeeping step's
  failure that stops the work it serves).
- A value one side of a boundary produces or accepts that the other side
  refuses or reads otherwise: a stricter shape in place of the reader it
  replaced, a plain-object lookup of a received code that answers for
  `constructor`, or a limit two layers apply in different units.
- A key, guard or bound wider or narrower than what it identifies: an alert
  deduplicated by a scope wider than what it flags, a recorded child row
  checked only by its foreign key, or a "latest" record picked by wall-clock
  time, so a clock set back hides the newest.

### Structure

- A domain rule added beside files of its theme instead of in its own
  concept, such as a payment refund rule in `sales/model/` beside
  `payment.ts` while `payments/` is empty.
- A piece placed for the wrong set of users: in `platform/` or `shell/` while
  one concept uses it, in one concept's folder while others import it from
  there, or copied into a second concept instead of moved.
- A test helper or case placed where it does not belong: an aspect test file
  (`<name>.<aspect>.test.ts`) or a second test of the concept copying setup
  instead of sharing it through `test-support/`, or a case added under a
  `describe` or aspect file named for another case (a Point refund test in
  the QR payment aspect file).

### Business rules and boundaries

- A screen out of step with what the cloud or the core answers: an action
  hidden from a row's flag (`isAdministrator`) while the cloud decides it
  with a domain predicate (`isRoleEditable`), a refund's state read from its
  method instead of its `state`, or an action offered to everyone who
  reaches the screen while its route requires another permission.
- A screen deciding about its own form through a contracts shape other than
  the one it validates the form with, or using a request shape's parse only
  as a yes/no while it sends a body built separately.
- A read of another concept declared as a port of the concept that needs it
  instead of a read port of its own concept.
- A business outcome decided outside the predicate that owns it: an answer
  about what an operation allows computed by another predicate than the
  operation applies, an adapter turning what a port records into another
  concept's outcome, or a scope the model declares applied only where a list
  offers its options while the use case that writes accepts any (packagings
  offered for active products while creating one accepts a deactivated
  product).

### Screens

- A screen hand-writing what a `packages/ui` piece named in build-screen
  covers, such as a panel total as `Eyebrow` plus a `text-display` figure
  where `FigureStat` exists.
- A screen standing in for an answer it does not have: an action the cloud
  answers for shown disabled from a defaulted flag while the record loads, a
  URL filter rewritten as not offered because its options failed to load, or
  an item shown as being checked, with a busy indicator, while the only
  attempt already failed.
- A query out of step with what changes it: a value left stale by an
  operation that changes it (a register status no charge outcome
  invalidates); a key invalidated again beside one that already contains
  it, so it is read twice; or a re-read that calls the loader and writes the
  cache, so a failed read shows no failure.
- A modal handling an answer that arrives after it closed: a stale notice on
  its next opening, a late success whose list refresh is dropped, or a late
  callback resetting a later opening.
- A guard out of step with what it guards: every route to a screen refused
  while the core refuses only one action, or a person sent back to the
  screen they are leaving.

### User-facing text

- English reaching the screen: a stored identifier shown as a value
  (`production`), or a cloud error's English text or a raw code interpolated
  into a Spanish sentence.
- A locked control left plainly disabled: its tooltip dropped while a
  refusal shows elsewhere, so the control itself no longer says why it is
  locked.
- A text saying more or other than what happened or what the domain does: a
  success notice naming every role while only some saved, a cause the
  answer does not carry ("La tarjeta no se aprobó" for a decline that may be
  a QR payment), or a consequence nothing produces ("El Administrador ya
  fue avisado" for a condition no alert reports).
- A text that names what the app does not show or have: a help step telling
  the person to press "Reimprimir como duplicado" on an icon-only button, or
  a refusal sending the cashier to a returns screen the register lacks.
- Texts shown together that repeat or contradict each other: a refusal
  beside a standing notice saying the same, or "Seguir vendiendo igual" in
  the status bar that says "La caja no puede vender".

### Comments

- A name or comment the change made untrue: a variable kept as
  `refreshSales` after it was rebound to a hook that refreshes only
  payments, a test still titled for a setup or a set of values it no longer
  has ("rejects a status outside starting, down and up" after `updating`
  became valid), or a comment naming the folder a moved file left.

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
- A test that does not control the timing or the processes it depends on: a
  baseline taken while the app it started may still be working, a wait ended
  only by events a broken run may never raise, or a cleanup that ends a hung
  process with a signal it handles as the same quit that hung.
- A test removed while nothing else verifies its rule: a case deleted with
  the code it covered while the replacing code applies the same rule (an
  adapter's ordering case dropped while the new adapter keeps the same
  `ORDER BY`).
- A migration that leaves data or rights other than the schema means: a
  backfill that guesses what old rows cannot prove (every recovery link
  marked sent while some failed and await a retry), a column for a shown
  value added with no backfill from what the database already records, or a
  table the schema calls append-only left writable by `cloud_app`.

### Data

- A fixture recorded from a real service that keeps an identity its scrubber
  does not name, such as an `O=` legal name when only `CN=` is replaced.
- Sample or seeded data in a state the running system never produces: an
  alert scoped to a record its detector does not watch, so the next run
  closes it, or a lifetime its producer never writes for those days.

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
