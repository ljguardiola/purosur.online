# Application stack

The backoffice and the register's renderer are built on one stack:

- Data from outside the screen (the cloud in the backoffice, the core in the register) is read with TanStack Query, never with a hand-written loading hook.
- Forms are built with TanStack Form, validating with the Zod schemas of `packages/contracts` through Standard Schema.
- Lists are built with TanStack Table.
- Navigation uses TanStack Router.
- State only a screen needs (which modal is open, a selection, a draft) is plain React state. No global store library, such as Zustand, is added.

Replacing or dropping a library of this stack is the repository owner's decision, made before the pull request that does it. Code that predates the stack is migrated by its own change; new code follows the stack even beside code that does not yet.
