import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import { productPicker } from "./test-support/discount-modal";
import { yerbaOff } from "./test-support/discounts";
import { createServices, loaded } from "./test-support/discounts-list-screen";

test.each([
  [
    "a session that manages promotions and products",
    accessWith("promotions", "catalog_area", "products_and_categories"),
    true,
  ],
  ["a session that only manages promotions", accessWith("promotions", "catalog_area"), false],
])(
  "offers creating a product from the new promotion's selector to %s only if allowed",
  async (_name, access, offered) => {
    const screen = await loaded(createServices(), [yerbaOff], { access });
    await userEvent.click(screen.getByRole("button", { name: "Nueva promoción" }));
    const dialog = screen.getByRole("dialog");

    await userEvent.fill(productPicker(dialog), "Fideos nuevos");

    const entry = screen.getByRole("option", { name: "Crear producto «Fideos nuevos»" });
    await expect.element(offered ? entry : page.getByText("Sin resultados")).toBeVisible();
    expect(entry.query() !== null).toBe(offered);
  },
);
