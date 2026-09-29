import { type Locator, userEvent } from "vitest/browser";

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

export async function fillNewProductFieldsExceptBarcodes(dialog: Locator) {
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Producto nuevo");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por unidad"));
}

export function scanInputOf(dialog: Locator) {
  return dialog.getByRole("textbox", { name: "Escanear otro código" });
}
