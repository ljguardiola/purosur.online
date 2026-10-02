---
paths:
  - "apps/backoffice/src/**"
  - "apps/pos/src/renderer/**"
  - "packages/ui/src/**"
---

# User-facing text

User-facing text is Spanish (see `.claude/rules/code-style.md`). On every screen of both apps:

- A label read together with its value or options makes one natural sentence (`Motivo: Arrepentimiento`, never `Motivo: Buen estado`); rename the label or the options until it does.
- No line restates what the screen's state already implies, repeats a nearby title or message, or explains what the person already knows. A constraint that explains a locked control goes in a tooltip on it, not in a line under the field.
- No text announces that an action is recorded, logged or audited.
- A table's row actions are icon-only buttons, with the same icon for the same action on every screen; text buttons are for the screen's and the modal's own actions.
