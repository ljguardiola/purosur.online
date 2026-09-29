---
name: build-screen
description: Build or change a backoffice screen from the design system in packages/ui, covering every state it can be in. Use when creating a screen, adding a section or an action to one, or reviewing how a screen shows loading, empty, failure, refresh and action outcomes.
---

The rules for backoffice screens live in `CONTRIBUTING.md` ("Structure",
"Code style", "Backoffice screens", "React code" and "Testing"). This skill
only sequences the steps and maps each state to its `packages/ui` piece; it
never restates those rules. Every step below follows the TDD order in
"Code style".

## 1. Know the pieces before writing the screen

- Every piece a screen may use is exported from `packages/ui/src/index.ts`.
  Components live in `packages/ui/src/components/`, in folders named for
  their purpose (`data-display`, `feedback`, `forms`, `layout`,
  `navigation`, `overlays`). What several components share is in
  `packages/ui/src/components/shared/`: `Tone` and `NoticeTone`
  (`tone.ts`), which type every `tone` prop, `LoadStatus`
  (`load-status.ts`) and `Icon` (`icon.ts`). A `variant` prop is each
  component's own union, declared in the component.
- Browse the catalog to see each component and its states:
  `mise exec node@$(cat .node-version) -- pnpm catalog` starts Storybook
  locally. Each component's stories sit next to it
  (`<component>.stories.tsx`, titled `Components/<Name>`), one story per
  state; read the story to see the exact props that produce that state.
- Each story has an approved screenshot in
  `packages/ui/src/__screenshots__/catalog-screenshots.visual.tsx/`, named
  after the story (`components-button-primary-chromium.png` for
  `Components/Button`'s Primary); they show a state without running the
  catalog.
- The screen's frame comes from the backoffice's `shell/`: `ScreenLayout`
  (`screen-layout.tsx`) and `ScreenTitle` (`screen-title.tsx`). A screen
  that cannot open at all — its code fails to download or its route throws —
  already shows `ScreenFailure` (`shell/screen-failure.tsx`), registered as
  the router's default error component in `shell/app-router.ts`; a screen
  never builds its own.

## 2. Cover every state with its piece

A section reads its data through `useCloudQuery`
(`apps/backoffice/src/platform/use-cloud-query.ts`), wrapped in its
concept's `<concept>-queries.ts` (such as `catalog/catalog-queries.ts`).
It combines several reads with `combineCloudData`
(`platform/combine-cloud-data.ts`), and a table takes its loading and failure
from `cloudTableState` (`platform/cloud-table-state.tsx`). Its rows come from
`tableRows` (`packages/ui/src/components/data-display/table/table-rows.ts`),
which sorts, filters and pages them. The rules for
loading, refreshing after a change and checking responses are in
"Structure" and "Backoffice screens" in `CONTRIBUTING.md`.

List the sections of the screen that load data and the actions a person can
take, then give each one every state below. The rules for these states are
in "Backoffice screens" in `CONTRIBUTING.md`; this table only says which
piece serves each one.

| State | Table section | Any other section |
|---|---|---|
| Loading | `Table`'s `loading="initial"` | `LoadingPlaceholder`, with the variant (`form`, `card`, `list`) in the shape of the section |
| Empty | `Table`'s `empty` (an `EmptyState`'s props; `variant="blank"` when nothing exists, `"filtered"` when the filters hide everything) | `EmptyState` |
| Failed to load | `Table`'s `failure` (a `LoadFailure`'s props) | `LoadFailure` |
| Refreshing data already shown | `Table`'s `loading="updating"` | no piece yet: see step 4 |
| Actions on the section's data | `Button`'s `dataStatus` with the section's `LoadStatus` | same |

For the outcome of each action, these are the pieces the design system
offers:

- A field the action refuses: the form's bound field from `useCloudForm`
  (`apps/backoffice/src/platform/cloud-form.tsx`), which passes the
  field's `errorMessage`; `SharedFieldError`
  (`platform/cloud-form-fields.tsx`) for one message shared by several
  inputs through `errorMessageId`
  (`packages/ui/src/components/forms/field-error.ts`). The rules for forms
  are in "Backoffice screens" in `CONTRIBUTING.md`.
- A result shown where the action was taken, such as inside its `Modal`:
  `InlineNotice` or `NotificationCard`, with the `tone` of the outcome.
- A result for the whole screen: `FloatingNotification`. `packages/ui`
  places it and decides how long it stays; the screen passes what to show
  and an `onDismiss` that clears it, and adds no placement or timer of its
  own.
- A question before an action goes ahead: `Modal` with
  `width="confirmation"`.

The canonical use of each pattern is in its own stories:
`packages/ui/src/components/data-display/table/table.stories.tsx`, and
`loading-placeholder.stories.tsx`, `empty-state.stories.tsx`,
`load-failure.stories.tsx`, `notification-card.stories.tsx` and
`floating-notification.stories.tsx` in
`packages/ui/src/components/feedback/`, and
`packages/ui/src/components/forms/button.stories.tsx`. An existing screen
that handles a state some other way is not a precedent.

## 3. Style only through the design system

- Take every color, spacing, type size, radius, shadow and layer from the
  role tokens in `packages/ui/src/styles/tokens.css` through their Tailwind
  utilities (`bg-surface`, `text-text-subtle`, `border-border`,
  `text-body`); the theme holds nothing else.
- No arbitrary values (`w-[13px]`, `bg-(--x)`, `[&>svg]:`):
  `.github/scripts/no-arbitrary-tailwind-values.mjs` rejects them in
  `packages/ui`, the backoffice and the register's renderer, and
  `pnpm verify` runs it.
- Text follows "Code style" in `CONTRIBUTING.md`.

## 4. When the design system lacks a piece or a state

Never build it inside the screen, and never approximate it with markup and
classes of your own. Add it to `packages/ui` first:

1. A failing browser test beside it (`<component>.test.tsx`), including an
   accessibility check with `expectNoAccessibilityViolations` from
   `packages/ui/src/test/axe.ts`.
2. The component or state in its purpose folder, typed with the shared
   contracts where they apply, exported from `packages/ui/src/index.ts`.
3. A story for every state in `<component>.stories.tsx`;
   `packages/ui/src/catalog-completeness.test.tsx` fails for an exported
   component with no story.
4. Its screenshots, approved with
   `mise exec node@$(cat .node-version) -- pnpm catalog:approve`; review the
   new images before committing them.

Then use it in the screen.

## 5. Test the screen

Divide the screen's code from the start into the kinds of file in
"Backoffice screens" in `CONTRIBUTING.md`, and give each modal, form model,
field message, part and helper the tests beside it that section assigns it.

For each state and each action's outcome, first write the screen's test
(`<screen>-screen.test.tsx` beside it) showing how the screen presents it,
then the code that makes it pass. The test covers the screen's presentation
and its wiring to the cloud and to its modals, not the behavior its other
files' tests or `packages/ui` own. Finish with the `check` skill.
