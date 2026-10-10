import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { WeightModal } from "./weight-modal";

const INVALID_WEIGHT_MESSAGE = "Ingresá un peso mayor a 0 kg, con hasta 3 decimales.";
const WEIGHT_FIELD = "Peso en kg";

type Confirm = (weight: number) => Promise<"invalid_weight" | "done">;

async function renderModal(confirm: Confirm = async () => "done", currentWeight?: number) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const confirmWeight = vi.fn(confirm);
  const onClose = vi.fn();
  const screen = await render(
    <WeightModal
      productName="Queso cremoso"
      currentWeight={currentWeight}
      confirm={confirmWeight}
      onClose={onClose}
    />,
  );
  return {
    screen,
    confirmWeight,
    onClose,
    field: screen.getByRole("textbox", { name: WEIGHT_FIELD }),
  };
}

describe("WeightModal", () => {
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

  it("asks for the new weight of a line, starting from its current weight", async () => {
    const { screen, field } = await renderModal(undefined, 1250);

    await expect
      .element(screen.getByRole("heading", { name: "Cambiar el peso de Queso cremoso" }))
      .toBeVisible();
    await expect.element(field).toHaveValue("1,250");
    await expect.element(screen.getByRole("button", { name: "Cambiar peso" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("confirms the typed weight in thousandths of a kilogram", async () => {
    const { screen, field, confirmWeight } = await renderModal();

    await field.fill("1,25");
    await screen.getByRole("button", { name: "Agregar" }).click();

    await expect.poll(() => confirmWeight.mock.calls).toEqual([[1250]]);
  });

  it("confirms with Enter", async () => {
    const { field, confirmWeight } = await renderModal();

    await field.fill("0,5");
    await userEvent.keyboard("{Enter}");

    await expect.poll(() => confirmWeight.mock.calls).toEqual([[500]]);
  });

  it.each(["", "abc", "0", "1,2345"])(
    "refuses a typed weight of '%s' without confirming it",
    async (typed) => {
      const { screen, field, confirmWeight } = await renderModal();

      await field.fill(typed);
      await screen.getByRole("button", { name: "Agregar" }).click();

      await expect.element(screen.getByText(INVALID_WEIGHT_MESSAGE)).toBeVisible();
      expect(confirmWeight).not.toHaveBeenCalled();
    },
  );

  it("shows the field error when the core refuses the weight, and keeps the modal open", async () => {
    const { screen, field, onClose } = await renderModal(async () => "invalid_weight");

    await field.fill("1");
    await screen.getByRole("button", { name: "Agregar" }).click();

    await expect.element(screen.getByText(INVALID_WEIGHT_MESSAGE)).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes without confirming when cancelled", async () => {
    const { screen, field, confirmWeight, onClose } = await renderModal();

    await field.fill("1");
    await screen.getByRole("button", { name: "Cancelar" }).click();

    expect(onClose).toHaveBeenCalledOnce();
    expect(confirmWeight).not.toHaveBeenCalled();
  });
});
