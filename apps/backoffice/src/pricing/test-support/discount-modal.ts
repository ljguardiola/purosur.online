import { expect } from "vitest";
import { page, userEvent } from "vitest/browser";
import { radioLabel } from "../../catalog/test-support/product-form";

type Dialog = Parameters<typeof radioLabel>[0];

export async function typeDate(dialog: Dialog, label: "Desde" | "Hasta", digits: string) {
  await userEvent.click(
    dialog
      .getByRole("group", { name: new RegExp(`^${label}`) })
      .getByRole("spinbutton")
      .first(),
  );
  await userEvent.keyboard(digits);
}

export function dateSegments(dialog: Dialog, label: "Desde" | "Hasta") {
  return dialog
    .getByRole("group", { name: new RegExp(`^${label}`) })
    .getByRole("spinbutton")
    .all()
    .map((segment) => segment.element().textContent);
}

export async function chooseTarget(dialog: Dialog, placeholder: string, option: string) {
  await userEvent.click(dialog.getByRole("button", { name: new RegExp(`^${placeholder}`) }));
  await userEvent.click(dialog.getByRole("option", { name: option }));
}

export function productPicker(dialog: Dialog) {
  return dialog.getByRole("combobox", { name: /^Producto/ });
}

// The list opens outside the dialog. Picking with the keyboard: a pointer click on an option scrolls it into view first, which
// closes the list.
export async function chooseProduct(dialog: Dialog, typed: string, option: string) {
  await userEvent.fill(productPicker(dialog), typed);
  await expect.element(page.getByRole("option", { name: option })).toBeVisible();
  await userEvent.keyboard("{ArrowDown}{Enter}");
}

export async function fillNewDiscountExceptTarget(dialog: Dialog) {
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Yerba de septiembre");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Descuento/ }), "15");
  await typeDate(dialog, "Desde", "12092026");
  await typeDate(dialog, "Hasta", "30092026");
}

export async function fillValidNewDiscount(dialog: Dialog) {
  await fillNewDiscountExceptTarget(dialog);
  await chooseProduct(dialog, "Yerba", "Yerba Playadito 1 kg");
}

export async function chooseBuyNPayM(dialog: Dialog) {
  await userEvent.click(radioLabel(dialog, "Lleve N, pague M"));
}

export async function fillQuantities(dialog: Dialog, buy: string, pay: string) {
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Lleve/ }), buy);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Pague/ }), pay);
}

export { radioLabel };
