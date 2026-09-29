---
name: build-screen
description: Build or change a backoffice screen from the design system in packages/ui, covering every state it can be in. Use when creating a screen, adding a section or an action to one, or reviewing how a screen shows loading, empty, failure, refresh and action outcomes.
---

The rules for backoffice screens live in `CONTRIBUTING.md` ("Structure",
"Code style", "Backoffice screens", "React code" and "Testing"). This skill
only sequences the steps and maps each state to its `packages/ui` piece; it
never restates those rules.

## 1. Know the pieces before writing the screen

- Every piece a screen may use is exported from `packages/ui/src/index.ts`.
  Components live in `packages/ui/src/components/`, in folders named for
  their purpose (`data-display`, `feedback`, `forms`, `layout`,
  `navigation`, `overlays`). What several components share is in
  `packages/ui/src/components/shared/`: `Tone` and `NoticeTone`
  (`tone.ts`), `LoadStatus` (`load-status.ts`) and `Icon` (`icon.ts`). A
  component chooses its look through a `variant` prop and its meaning
  through a `tone` prop, typed with these shared contracts.
- Browse the catalog to see each component and its states:
  `mise exec node@$(cat .node-version) -- pnpm catalog` starts Storybook
  locally. Each component's stories sit next to it
  (`<component>.stories.tsx`, titled `Components/<Name>`), one story per
  state; read the story to see the exact props that produce that state.
- Each story has an approved screenshot in `packages/ui/src/__screenshots__/`
  (`<story-id>-chromium.png`). `pnpm verify` renders every story again and
  fails on any difference; the screenshots are a quick way to see a state
  without running the catalog.
- The screen's frame comes from the backoffice's `shell/`: `ScreenLayout`
  (`screen-layout.tsx`) and `ScreenTitle` (`screen-title.tsx`). A screen
  that cannot open at all — its code fails to download or its route throws —
  already shows `ScreenFailure` (`shell/screen-failure.tsx`), registered as
  the router's default error component in `shell/app-router.ts`; a screen
  never builds its own.

## 2. Cover every state with its piece

List the sections of the screen that load data and the actions a person can
take, then give each one every state below. The rule for each state is in
"Backoffice screens" in `CONTRIBUTING.md`; this is where each one comes from.

| State | Table section | Any other section |
|---|---|---|
| Loading | `Table`'s `loading="initial"` | `LoadingPlaceholder` with the variant (`form`, `card`, `list`) in the shape of the section |
| Empty | `Table`'s `empty` (an `EmptyState`'s props; `variant="blank"` when nothing exists, `"filtered"` when the filters hide everything) | `EmptyState` |
| Failed to load | `Table`'s `failure` (a `LoadFailure`'s props) | `LoadFailure`, whose `onRetry` loads the section again from its loading state |
| Refreshing data already shown | `Table`'s `loading="updating"` | the data stays shown |
| Actions on the section's data | `Button`'s `dataStatus` with the section's `LoadStatus` | same |

For the outcome of each action:

- While it runs, the controls that would start it again are disabled, never
  hidden.
- A field the action refuses shows it on the field (`errorMessage`, or
  `errorMessageId` for a message several fields share; see
  `packages/ui/src/components/forms/field-error.ts`).
- A refusal or failure of the attempt as a whole shows as an `InlineNotice`
  with `tone="error"` where the action was taken: inside its `Modal`, or in
  its section.
- An action that asks for confirmation first uses a `Modal` with
  `width="confirmation"`.
- Success shows as the screen's data changing (the modal closes, the list
  shows the new row); there is no toast in the design system.

The canonical use of each pattern is in its own stories:
`packages/ui/src/components/data-display/table/table.stories.tsx`,
`packages/ui/src/components/feedback/loading-placeholder.stories.tsx`,
`empty-state.stories.tsx`, `load-failure.stories.tsx` and
`packages/ui/src/components/forms/button.stories.tsx`. An existing screen
that handles a state some other way is not a precedent.

## 3. Style only through the design system

- Take every color, spacing, type size, radius, shadow and layer from the
  role tokens in `packages/ui/src/styles/tokens.css` through their Tailwind
  utilities (`bg-surface`, `text-text-subtle`, `border-border`,
  `text-body`); the theme holds nothing else.
- No arbitrary values (`w-[13px]`, `bg-(--x)`, `[&>svg]:`):
  `.github/scripts/no-arbitrary-tailwind-values.mjs` rejects them in
  `packages/ui` and the apps, and `pnpm verify` runs it.
- The screen writes only its own Spanish text, passed to the components as
  props; a component's fixed text (such as Reintentar) comes from the
  component.

## 4. When the design system lacks a piece or a state

Never build it inside the screen, and never approximate it with markup and
classes of your own. Add it to `packages/ui` first, as its own commit before
the screen uses it:

1. The component or state in its purpose folder, typed with the shared
   contracts where they apply, exported from `packages/ui/src/index.ts`.
2. A browser test beside it (`<component>.test.tsx`), including an
   accessibility check with `expectNoAccessibilityViolations` from
   `@purosur/ui/test`.
3. A story for every state in `<component>.stories.tsx`;
   `packages/ui/src/catalog-completeness.test.tsx` fails for an exported
   component with no story.
4. Its screenshots, approved with
   `mise exec node@$(cat .node-version) -- pnpm catalog:approve`; review the
   new images before committing them.

Then use it in the screen.

## 5. Test the screen

The screen's own test (`<screen>.test.tsx` beside it) shows how the screen
presents each state and each action's outcome, and its wiring to the cloud;
it does not test the component's behavior, which `packages/ui` owns. Finish
with the `check` skill.
