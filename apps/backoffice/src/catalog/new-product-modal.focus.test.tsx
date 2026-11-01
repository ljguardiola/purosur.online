import { beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { createServices, renderNewProductModal } from "./test-support/new-product-modal";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

test("opens on the product's name, so typing right away writes it", async () => {
  const screen = await renderNewProductModal(createServices());
  const productDialog = screen.getByRole("dialog", { name: "Nuevo producto" });
  const productName = productDialog.getByRole("textbox", { name: /^Nombre/ });
  await expect.element(productName).toHaveFocus();

  await userEvent.keyboard("Dátiles sin carozo");

  await expect.element(productName).toHaveValue("Dátiles sin carozo");
});

test("a brand created from the brand selector opens on its name, and closing it returns to the brand selector", async () => {
  const screen = await renderNewProductModal(createServices());
  const productDialog = screen.getByRole("dialog", { name: "Nuevo producto" });
  const brandSelector = productDialog.getByRole("combobox", { name: /^Marca/ });
  await userEvent.fill(brandSelector, "Dulcor");
  await userEvent.click(page.getByRole("option", { name: "Crear marca «Dulcor»" }));

  const brandDialog = page.getByRole("dialog", { name: "Nueva marca" });
  const brandName = brandDialog.getByRole("textbox", { name: /^Nombre/ });
  await expect.element(brandName).toHaveFocus();
  await userEvent.keyboard("{Control>}a{/Control}Dulcor del Sur");
  await expect.element(brandName).toHaveValue("Dulcor del Sur");

  await userEvent.click(brandDialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => brandDialog.query()).toBeNull();
  await expect.element(brandSelector).toHaveFocus();
});
