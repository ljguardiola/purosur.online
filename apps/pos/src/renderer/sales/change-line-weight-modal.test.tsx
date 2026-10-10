import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { ChangeLineWeightModal } from "./change-line-weight-modal";

const INVALID_WEIGHT_MESSAGE = "Ingresá un peso mayor a 0 kg, con hasta 3 decimales.";
const ABOVE_LINE_LIMIT_MESSAGE = "El peso supera el máximo de una línea.";
const WEIGHT_FIELD = "Peso en kg";

type ChangeLineWeight = (weight: number) => Promise<"invalid_weight" | "done">;

async function renderModal(changeLineWeight: ChangeLineWeight = async () => "done") {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const change = vi.fn(changeLineWeight);
  const onClose = vi.fn();
  const screen = await render(
    <ChangeLineWeightModal
      productName="Queso cremoso"
      currentWeight={1250}
      changeLineWeight={change}
      onClose={onClose}
    />,
  );
  return {
    screen,
    change,
    onClose,
    field: screen.getByRole("textbox", { name: WEIGHT_FIELD }),
  };
}

describe("ChangeLineWeightModal", () => {
  it("asks for the new weight of a line, starting from its current weight", async () => {
    const { screen, field } = await renderModal();

    await expect
      .element(screen.getByRole("heading", { name: "Cambiar el peso de Queso cremoso" }))
      .toBeVisible();
    await expect.element(field).toHaveValue("1,250");
    await expect.element(field).toHaveFocus();
    await expect.element(screen.getByRole("button", { name: "Cambiar peso" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cancelar" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("changes the line to the typed weight in thousandths of a kilogram", async () => {
    const { screen, field, change } = await renderModal();

    await field.fill("0,8");
    await screen.getByRole("button", { name: "Cambiar peso" }).click();

    await expect.poll(() => change.mock.calls).toEqual([[800]]);
  });

  it("changes with Enter", async () => {
    const { field, change } = await renderModal();

    await field.fill("2");
    await userEvent.keyboard("{Enter}");

    await expect.poll(() => change.mock.calls).toEqual([[2000]]);
  });

  it.each([
    ["", INVALID_WEIGHT_MESSAGE],
    ["abc", INVALID_WEIGHT_MESSAGE],
    ["0", INVALID_WEIGHT_MESSAGE],
    ["1,2345", INVALID_WEIGHT_MESSAGE],
    ["3.000.000", ABOVE_LINE_LIMIT_MESSAGE],
  ])("refuses a typed weight of '%s' without changing the line", async (typed, message) => {
    const { screen, field, change } = await renderModal();

    await field.fill(typed);
    await screen.getByRole("button", { name: "Cambiar peso" }).click();

    await expect.element(screen.getByText(message)).toBeVisible();
    expect(change).not.toHaveBeenCalled();
  });

  it("shows the field error when the core refuses the weight, and keeps the modal open", async () => {
    const { screen, field, onClose } = await renderModal(async () => "invalid_weight");

    await field.fill("1");
    await screen.getByRole("button", { name: "Cambiar peso" }).click();

    await expect.element(screen.getByText(INVALID_WEIGHT_MESSAGE)).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes without changing the line when cancelled", async () => {
    const { screen, field, change, onClose } = await renderModal();

    await field.fill("1");
    await screen.getByRole("button", { name: "Cancelar" }).click();

    expect(onClose).toHaveBeenCalledOnce();
    expect(change).not.toHaveBeenCalled();
  });
});
