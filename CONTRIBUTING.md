# Contributing

The repository contract lives in `.claude/rules/`, one file per topic. Claude Code loads each file automatically; a file with `paths:` loads only when a matching file is read.

| File | Topic |
|---|---|
| [`setup.md`](.claude/rules/setup.md) | Getting started, running it locally, pinned versions |
| [`workflow.md`](.claude/rules/workflow.md) | Issues, branches and pull requests, working on an issue, Dependabot |
| [`structure.md`](.claude/rules/structure.md) | Folders and file names |
| [`boundaries.md`](.claude/rules/boundaries.md) | Business rules and boundaries, operations |
| [`code-style.md`](.claude/rules/code-style.md) | TDD and commit order, language, comments, test data |
| [`testing.md`](.claude/rules/testing.md) | Which test owns each risk, migrations, time in tests, screenshots |
| [`checks.md`](.claude/rules/checks.md) | CI checks, secrets |
| [`releases.md`](.claude/rules/releases.md) | Releases |
| [`user-facing-text.md`](.claude/rules/user-facing-text.md) | Text on screens |
| [`application-stack.md`](.claude/rules/application-stack.md) | The screens' libraries |
| [`backoffice-screens.md`](.claude/rules/backoffice-screens.md) | Backoffice screens |
| [`register-screens.md`](.claude/rules/register-screens.md) | Register screens |
| [`react.md`](.claude/rules/react.md) | React code |
