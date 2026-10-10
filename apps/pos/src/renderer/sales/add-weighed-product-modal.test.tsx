import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { AddWeighedProductModal } from "./add-weighed-product-modal";

const INVALID_WEIGHT_MESSAGE = "Ingresá un peso mayor a 0 kg, con hasta 3 decimales.";
const ABOVE_LINE_LIMIT_MESSAGE = "El peso supera el máximo de una línea.";
const WEIGHT_FIELD = "Peso en kg";

type AddWeighedProduct = (weight: number) => Promise<"invalid_weight" | "done">;

async function renderModal(addWeighedProduct: AddWeighedProduct = async () => "done") {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const add = vi.fn(addWeighedProduct);
  const onClose = vi.fn();
  const screen = await render(
    <AddWeighedProductModal
      productName="Queso cremoso"
      addWeighedProduct={add}
      onClose={onClose}
    />,
  );
  return {
    screen,
    add,
    onClose,
    field: screen.getByRole("textbox", { name: WEIGHT_FIELD }),
  };
}

describe("AddWeighedProductModal", () => {
  it("asks for the weight of the product being added", async () => {
    const { screen, field } = await renderModal();

    await expect
      .element(screen.getByRole("heading", { name: "Peso de Queso cremoso" }))
      .toBeVisible();
    await expect.element(field).toHaveValue("");
    await expect.element(field).toHaveFocus();
    await expect.element(screen.getByRole("button", { name: "Agregar" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cancelar" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("adds the product with the typed weight in thousandths of a kilogram", async () => {
    const { screen, field, add } = await renderModal();

    await field.fill("1,25");
    await screen.getByRole("button", { name: "Agregar" }).click();

    await expect.poll(() => add.mock.calls).toEqual([[1250]]);
  });

  it("adds with Enter", async () => {
    const { field, add } = await renderModal();

    await field.fill("0,5");
    await userEvent.keyboard("{Enter}");

    await expect.poll(() => add.mock.calls).toEqual([[500]]);
  });

  it.each([
    ["", INVALID_WEIGHT_MESSAGE],
    ["abc", INVALID_WEIGHT_MESSAGE],
    ["0", INVALID_WEIGHT_MESSAGE],
    ["1,2345", INVALID_WEIGHT_MESSAGE],
    ["3.000.000", ABOVE_LINE_LIMIT_MESSAGE],
  ])("refuses a typed weight of '%s' without adding it", async (typed, message) => {
    const { screen, field, add } = await renderModal();

    await field.fill(typed);
    await screen.getByRole("button", { name: "Agregar" }).click();

    await expect.element(screen.getByText(message)).toBeVisible();
    expect(add).not.toHaveBeenCalled();
  });

  it("shows the field error when the core refuses the weight, and keeps the modal open", async () => {
    const { screen, field, onClose } = await renderModal(async () => "invalid_weight");

    await field.fill("1");
    await screen.getByRole("button", { name: "Agregar" }).click();

    await expect.element(screen.getByText(INVALID_WEIGHT_MESSAGE)).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes without adding when cancelled", async () => {
    const { screen, field, add, onClose } = await renderModal();

    await field.fill("1");
    await screen.getByRole("button", { name: "Cancelar" }).click();

    expect(onClose).toHaveBeenCalledOnce();
    expect(add).not.toHaveBeenCalled();
  });
});
