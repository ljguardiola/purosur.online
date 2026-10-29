import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import { productPicker } from "./test-support/discount-modal";
import { targetsWithCreatedProduct } from "./test-support/discount-target-creation";
import { discountTargets, yerbaOff } from "./test-support/discounts";
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

test("a product created from the new promotion is read again from the cloud and selected", async () => {
  const services = createServices();
  vi.mocked(services.fetchDiscountTargets)
    .mockResolvedValueOnce({ kind: "ok", value: discountTargets })
    .mockResolvedValue({
      kind: "ok",
      value: targetsWithCreatedProduct("Fideos nuevos", ["PERCENT_OFF"]),
    });
  const screen = await loaded(services, [yerbaOff]);
  await userEvent.click(screen.getByRole("button", { name: "Nueva promoción" }));
  const dialog = screen.getByRole("dialog", { name: "Nueva promoción" });

  await userEvent.fill(productPicker(dialog), "Fideos nuevos");
  await userEvent.click(page.getByRole("option", { name: "Crear producto «Fideos nuevos»" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Nuevo producto" })
      .getByRole("button", { name: "Guardar lo creado" }),
  );

  await expect.element(productPicker(dialog)).toHaveValue("Fideos nuevos");
  expect(services.fetchDiscountTargets).toHaveBeenCalledTimes(2);
});
