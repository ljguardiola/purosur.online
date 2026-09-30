import { userEvent } from "vitest/browser";
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

export async function fillNewDiscountExceptTarget(dialog: Dialog) {
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Yerba de septiembre");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Descuento/ }), "15");
  await typeDate(dialog, "Desde", "12092026");
  await typeDate(dialog, "Hasta", "30092026");
}

export async function fillValidNewDiscount(dialog: Dialog) {
  await fillNewDiscountExceptTarget(dialog);
  await chooseTarget(dialog, "Elegí un producto", "Yerba Playadito 1 kg");
}

export async function chooseBuyNPayM(dialog: Dialog) {
  await userEvent.click(radioLabel(dialog, "Lleve N, pague M"));
}

export async function fillQuantities(dialog: Dialog, buy: string, pay: string) {
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Lleve/ }), buy);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Pague/ }), pay);
}

export { radioLabel };
