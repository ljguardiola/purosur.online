import { type Locator, userEvent } from "vitest/browser";
import { radioLabel } from "../../platform/test-support/radio-label";

export async function fillNewProductFieldsExceptBarcodes(dialog: Locator) {
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Producto nuevo");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por unidad"));
}

export function scanInputOf(dialog: Locator) {
  return dialog.getByRole("textbox", { name: "Escanear otro código" });
}
