import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { deferred } from "./test-support/sale-screen";
import type { ScaleWeighing } from "./weigh-product-modal";
import { WeighProductModal } from "./weigh-product-modal";

const WEIGHING: ScaleWeighing = { kind: "weighing" };
const TAKEN: ScaleWeighing = { kind: "taken", weightThousandths: 1250, amount: 1_562_500 };
const UNAVAILABLE_NOTE = "La balanza no está disponible. Tipeá el peso.";

async function renderModal(
  weigh: () => Promise<ScaleWeighing>,
  addWeighedProduct: (weight: number) => Promise<"invalid_weight" | "done"> = async () => "done",
) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const asking = vi.fn(weigh);
  const add = vi.fn(addWeighedProduct);
  const onClose = vi.fn();
  const screen = await render(
    <WeighProductModal
      productName="Queso cremoso"
      weigh={asking}
      addWeighedProduct={add}
      onClose={onClose}
    />,
  );
  return { screen, asking, add, onClose };
}

describe("WeighProductModal", () => {
  it("shows that it is weighing, with no weight and no amount, while the scale is not stable", async () => {
    const { screen } = await renderModal(async () => WEIGHING);

    await expect
      .element(screen.getByRole("heading", { name: "Peso de Queso cremoso" }))
      .toBeVisible();
    await expect.element(screen.getByText("Pesando…")).toBeVisible();
    await expect.element(screen.getByText("0,000 kg")).toBeVisible();
    await expect.element(screen.getByText("$ 0,00")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Tipear peso" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cancelar" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("asks the scale again after each answer that is not stable", async () => {
    const { asking } = await renderModal(async () => WEIGHING);

    await expect.poll(() => asking.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("shows the stable reading with its weight and amount, and stops asking", async () => {
    const { screen, asking } = await renderModal(async () => TAKEN);

    await expect.element(screen.getByText("Lectura estable")).toBeVisible();
    await expect.element(screen.getByText("1,250 kg")).toBeVisible();
    await expect.element(screen.getByText("$ 15.625,00")).toBeVisible();
    await expect.element(screen.getByText("Pesando…")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Listo" })).toHaveFocus();
    expect(asking).toHaveBeenCalledOnce();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("closes from Listo", async () => {
    const { screen, onClose } = await renderModal(async () => TAKEN);

    await screen.getByRole("button", { name: "Listo" }).click();

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes without taking anything when cancelled while weighing", async () => {
    const { screen, add, onClose } = await renderModal(async () => WEIGHING);

    await screen.getByRole("button", { name: "Cancelar" }).click();

    expect(onClose).toHaveBeenCalledOnce();
    expect(add).not.toHaveBeenCalled();
  });

  it("shows the typed weight form when the cashier chooses to type the weight, and adds what is typed", async () => {
    const { screen, add } = await renderModal(async () => WEIGHING);

    await screen.getByRole("button", { name: "Tipear peso" }).click();
    await screen.getByRole("textbox", { name: "Peso en kg" }).fill("0,5");
    await screen.getByRole("button", { name: "Agregar" }).click();

    await expect.poll(() => add.mock.calls).toEqual([[500]]);
    await expect.element(screen.getByText(UNAVAILABLE_NOTE).first()).not.toBeInTheDocument();
  });

  it("shows the typed weight form with a note when the scale is not available", async () => {
    const { screen } = await renderModal(async () => ({ kind: "scale_unavailable" }));

    await expect.element(screen.getByText(UNAVAILABLE_NOTE).first()).toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Peso en kg" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Tipear peso" }))
      .not.toBeInTheDocument();
  });

  it("shows the stable reading of an answer already on its way when the cashier chose to type", async () => {
    const answer = deferred<ScaleWeighing>();
    const { screen, add } = await renderModal(() => answer.promise);

    await screen.getByRole("button", { name: "Tipear peso" }).click();
    answer.resolve(TAKEN);

    await expect.element(screen.getByText("Lectura estable")).toBeVisible();
    expect(add).not.toHaveBeenCalled();
  });

  it("does not add a typed weight once the answer on its way took the reading", async () => {
    const answer = deferred<ScaleWeighing>();
    const { screen, add } = await renderModal(() => answer.promise);

    await screen.getByRole("button", { name: "Tipear peso" }).click();
    await screen.getByRole("textbox", { name: "Peso en kg" }).fill("2");
    await screen.getByRole("button", { name: "Agregar" }).click();
    answer.resolve(TAKEN);

    await expect.element(screen.getByText("Lectura estable")).toBeVisible();
    expect(add).not.toHaveBeenCalled();
  });

  it("adds a typed weight once the answer on its way was not a reading", async () => {
    const answer = deferred<ScaleWeighing>();
    const { screen, add } = await renderModal(() => answer.promise);

    await screen.getByRole("button", { name: "Tipear peso" }).click();
    await screen.getByRole("textbox", { name: "Peso en kg" }).fill("2");
    await screen.getByRole("button", { name: "Agregar" }).click();
    answer.resolve(WEIGHING);

    await expect.poll(() => add.mock.calls).toEqual([[2000]]);
  });
});
