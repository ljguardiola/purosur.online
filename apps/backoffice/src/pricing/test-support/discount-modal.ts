import { expect } from "vitest";
import { page, userEvent } from "vitest/browser";
import { radioLabel } from "../../platform/test-support/radio-label";

type Dialog = Parameters<typeof radioLabel>[0];

function validitySegmentsOf(dialog: Dialog) {
  return dialog.getByRole("group", { name: /^Vigencia/ }).getByRole("spinbutton");
}

const END_FIRST_SEGMENT = 3;

export async function typeValidityStart(dialog: Dialog, digits: string) {
  await userEvent.click(validitySegmentsOf(dialog).first());
  await userEvent.keyboard(digits);
}

export async function typeValidityEnd(dialog: Dialog, digits: string) {
  await userEvent.click(validitySegmentsOf(dialog).nth(END_FIRST_SEGMENT));
  await userEvent.keyboard(digits);
}

export function validitySegments(dialog: Dialog) {
  return validitySegmentsOf(dialog)
    .all()
    .map((segment) => segment.element().textContent);
}

const TARGET_LABELS: Record<string, string> = {
  "Elegí una categoría": "Categoría",
  "Elegí un distintivo": "Distintivo",
};

export async function chooseTarget(dialog: Dialog, placeholder: string, option: string) {
  const label = TARGET_LABELS[placeholder];
  await userEvent.click(dialog.getByRole("combobox", { name: new RegExp(`^${label}`) }));
  await userEvent.click(page.getByRole("option", { name: option }));
}

export function productPicker(dialog: Dialog) {
  return dialog.getByRole("combobox", { name: /^Producto/ });
}

// The list opens outside the dialog. A locator click scrolls the option into view first, and the
// scroll event closes the list, so the option is clicked as an element instead.
export async function chooseProduct(dialog: Dialog, typed: string, option: string) {
  await userEvent.fill(productPicker(dialog), typed);
  const named = page.getByRole("option", { name: option });
  await expect.element(named).toBeVisible();
  (named.element() as HTMLElement).click();
}

export async function fillNewDiscountExceptTarget(dialog: Dialog) {
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Yerba de septiembre");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Descuento/ }), "15");
  await typeValidityStart(dialog, "12092026");
  await typeValidityEnd(dialog, "30092026");
}

export async function fillValidNewDiscount(dialog: Dialog) {
  await fillNewDiscountExceptTarget(dialog);
  await chooseProduct(dialog, "Yerba", "Yerba Hoja Alta 1 kg Hoja Alta 1 kg");
}

export async function chooseBuyNPayM(dialog: Dialog) {
  await userEvent.click(radioLabel(dialog, "Lleve N, pague M"));
}

export async function fillQuantities(dialog: Dialog, buy: string, pay: string) {
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Lleve/ }), buy);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Pague/ }), pay);
}
