---
paths:
  - "apps/pos/src/renderer/**"
---

# Register screens

- The register has no URL: it moves between screens through declared, typed TanStack Router routes kept in a memory history. Navigating to a route that does not exist, or with a parameter that is missing or mistyped, fails to type-check.
- Every screen is reached through its own route, declared in the renderer's router (`shell/router.tsx`) under the root route or a layout route of it and added to its route tree, with the screen as the route's component. A route that takes a flag declares it in `validateSearch`. Links between screens use `shell/`'s `ScreenLink`, and an action that moves to another screen calls `navigate` with a typed `to`.
- A screen that must refuse entry before it renders declares that on its own route, as a guard (`beforeLoad`) that redirects instead of letting the screen render; the app never moves to another screen from an effect to keep a screen from showing. A change of the state the guards read only re-runs the current route's guard (`router.invalidate()`), so a person stays on a screen whose guard still lets them in.
- A screen (`<screen>-screen.tsx`) lives in its concept folder of `renderer/`, or in `shell/` when it belongs to the register's frame, with its parts (`<entity>-<part>.tsx`), its modals (`<action>-<entity>-modal.tsx`, opened by state the screen owns), its form models (`<entity>-form.ts`) and its hooks beside it, and its concept's query keys and query hooks in `<concept>-queries.ts`. A screen never calls the core client itself: what it asks the core for reaches it from its route.
- A screen reads the core's data with TanStack Query through `platform/`'s `useCoreQuery` (or its `coreQueryOptions`), with no retry and no refetch on focus, wrapped in a query hook of its concept's `<concept>-queries.ts`; a change notice from the core updates or invalidates the queries it affects. The sale in progress is read from the core the same way, and the screen keeps no second copy of it.
- A form is built with `packages/ui`'s `useRequestForm`, on TanStack Form, validating with the `packages/contracts` schema the core reads the request with. The PIN keypad and the sale screen's scan and search field are controls, not forms.
- A list is a table built with `packages/ui`'s `dataColumn`, `useTableModel` and `Table`, as in `.claude/rules/backoffice-screens.md`, with the core in place of the cloud.
- A screen uses `packages/ui`'s pieces, never a hand-written button or control where `packages/ui` has one, and shows its data's loading, empty and failed states only with `packages/ui`'s patterns, as in `.claude/rules/backoffice-screens.md`; Reintentar loads the section again starting from its loading placeholder. Amounts, quantities and dates are shown, and typed amounts read, with `packages/ui`'s functions.
