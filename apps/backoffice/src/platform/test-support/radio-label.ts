import type { Locator } from "vitest/browser";

// The "radio" role resolves to react-aria's own visually hidden native <input>; the visible,
// clickable surface is the <label> that wraps it.
export function radioLabel(dialog: Locator, title: string): HTMLElement {
  const input = dialog.getByRole("radio", { name: title }).element() as HTMLInputElement;
  const label = input.closest("label");
  if (!label) {
    throw new Error(`no label found for radio "${title}"`);
  }
  return label;
}
