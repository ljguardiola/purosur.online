import { beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { StubProductPriceSection } from "../platform/test-support/creation-parts";
import { renderEditRecipeModal } from "./test-support/edit-recipe-modal";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  maySetPrice = true,
  withSection = true,
}: {
  maySetPrice?: boolean;
  withSection?: boolean;
} = {}) {
  return renderEditRecipeModal({
    ...(withSection ? { productPriceSection: StubProductPriceSection } : {}),
    maySetPrice,
  });
}

test("hands the section the recipe's product and its components with their quantities in thousandths", async () => {
  const screen = await renderModal();
  const section = screen.getByRole("region", { name: "Precio de venta de prueba" });

  await expect
    .element(
      section.getByText(
        "Producto a0000000-0000-4000-8000-000000000001: Mix de frutos secos por KG",
      ),
    )
    .toBeVisible();
  await expect.element(section.getByText("Almendras: 400")).toBeVisible();
  await expect.element(section.getByText("Pasas: 100")).toBeVisible();
});

test("hands the section the components as they are being edited, unsaved", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByRole("textbox", { name: "Cantidad de Almendras" }), "0,7");

  await expect.element(dialog.getByText("Almendras: 700")).toBeVisible();
});

test("tells the section the quantities are incomplete while one is not valid", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("Pasas: 100")).toBeVisible();

  await userEvent.clear(dialog.getByRole("textbox", { name: "Cantidad de Almendras" }));

  const section = screen.getByRole("region", { name: "Precio de venta de prueba" });
  await expect.element(section.getByText("Cantidades incompletas")).toBeVisible();
  await expect.element(section.getByText("Pasas: 100")).not.toBeInTheDocument();
});

test("keeps the section and what it holds while a quantity passes through zero", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByRole("textbox", { name: "Precio de prueba" }), "17000");
  const quantity = dialog.getByRole("textbox", { name: "Cantidad de Almendras" });

  await userEvent.fill(quantity, "0");
  await expect.element(dialog.getByText("Cantidades incompletas")).toBeVisible();
  await userEvent.fill(quantity, "0,7");

  await expect.element(dialog.getByText("Almendras: 700")).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: "Precio de prueba" }))
    .toHaveValue("17000");
});

test.each([
  [true, "Puede fijar el precio"],
  [false, "No puede fijar el precio"],
])("tells the section whether the person may set prices: %s", async (maySetPrice, text) => {
  const screen = await renderModal({ maySetPrice });

  await expect.element(screen.getByRole("dialog").getByText(text)).toBeVisible();
});

test("shows no section when none is provided", async () => {
  const screen = await renderModal({ withSection: false });

  await expect
    .element(screen.getByRole("dialog").getByText("Almendras: 400"))
    .not.toBeInTheDocument();
});
