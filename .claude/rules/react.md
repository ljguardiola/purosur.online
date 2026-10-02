---
paths:
  - "apps/backoffice/src/**"
  - "apps/pos/src/renderer/**"
  - "packages/ui/src/**"
---

# React code

The backoffice, the register's renderer and `packages/ui` follow the Rules of React, because the backoffice and the register's renderer are built with the React Compiler, which memoizes every component and hook automatically:

- Rendering is pure: a component neither reads nor writes a ref while rendering, never mutates its props or state, and never reads something that changes outside React, such as the current time or browser storage. A value that changes over time lives in state that the render reads.
- Hooks are called unconditionally, at the top level of a component or another hook.
- A new component or hook does not memoize by hand with `useMemo`, `useCallback` or `memo`: the compiler already does.
- A component receives a ref as an ordinary prop, not through `forwardRef`.

`pnpm verify` fails on a component or hook the React Compiler cannot compile, and on every React-specific mistake the linter detects, such as a hook called conditionally, a missing effect dependency, a list item without a key, a `&&` condition that can render a stray value, `forwardRef`, a hard-coded element id, or a component declared inside another. A render that reads the clock or another outside value is not detected: review catches it.
