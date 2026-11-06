import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { deferred } from "./test-support/sale-screen";
import type { ScaleWeighing } from "./weigh-product-modal";
import { WeighProductModal } from "./weigh-product-modal";

const WEIGHING: ScaleWeighing = { kind: "weighing" };
const STABLE_120: ScaleWeighing = {
  kind: "stable",
  reading: { weightThousandths: 120, amount: 150_000 },
};
const STABLE_250: ScaleWeighing = {
  kind: "stable",
  reading: { weightThousandths: 250, amount: 312_500 },
};
const UNSTEADY_80: ScaleWeighing = {
  kind: "unsteady",
  reading: { weightThousandths: 80, amount: 100_000 },
};
const UNSTEADY_140: ScaleWeighing = {
  kind: "unsteady",
  reading: { weightThousandths: 140, amount: 175_000 },
};
const STABLE_150: ScaleWeighing = {
  kind: "stable",
  reading: { weightThousandths: 150, amount: 187_500 },
};
const TAKEN_150: ScaleWeighing = {
  kind: "taken",
  reading: { weightThousandths: 150, amount: 187_500 },
};
const ZERO: ScaleWeighing = { kind: "stable", reading: { weightThousandths: 0, amount: 0 } };
const TAKEN: ScaleWeighing = {
  kind: "taken",
  reading: { weightThousandths: 250, amount: 312_500 },
};
const UNAVAILABLE_NOTE = "La balanza no está disponible. Tipeá el peso.";
const ZERO_NOTE = "Poné el producto en la balanza o tipeá el peso.";

function scripted(...answers: ScaleWeighing[]) {
  const pending = [...answers];
  return async (): Promise<ScaleWeighing> => pending.shift() ?? answers.at(-1) ?? WEIGHING;
}

async function renderModal(
  weigh: (confirmedWeightThousandths: number | null) => Promise<ScaleWeighing>,
  { currentWeight }: { currentWeight?: number } = {},
) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const asking = vi.fn(weigh);
  const typed = vi.fn(async (_weight: number): Promise<"invalid_weight" | "done"> => "done");
  const onClose = vi.fn();
  const screen = await render(
    <WeighProductModal
      productName="Queso cremoso"
      weigh={asking}
      typedWeight={typed}
      currentWeight={currentWeight}
      onClose={onClose}
    />,
  );
  return { screen, asking, typed, onClose };
}

describe("WeighProductModal", () => {
  it("shows that it is weighing, with no weight and no amount, before the first stable reading", async () => {
    const { screen } = await renderModal(async () => WEIGHING);

    await expect
      .element(screen.getByRole("heading", { name: "Peso de Queso cremoso" }))
      .toBeVisible();
    await expect.element(screen.getByText("Pesando…")).toBeVisible();
    await expect.element(screen.getByText("0,000 kg")).toBeVisible();
    await expect.element(screen.getByText("$ 0,00")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Tipear peso" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cancelar" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Confirmar peso" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the stable reading with its weight and amount without closing", async () => {
    const { screen, onClose } = await renderModal(async () => STABLE_250);

    await expect.element(screen.getByText("Lectura estable")).toBeVisible();
    await expect.element(screen.getByText("0,250 kg")).toBeVisible();
    await expect.element(screen.getByText("$ 3.125,00")).toBeVisible();
    await expect.element(screen.getByText("Pesando…")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("follows the bag: the stable weight, the movement with the last weight, the next stable weight", async () => {
    const first = deferred<ScaleWeighing>();
    const second = deferred<ScaleWeighing>();
    const third = deferred<ScaleWeighing>();
    const answers = [first, second, third];
    const { screen, asking } = await renderModal(
      () => (answers.shift() ?? deferred<ScaleWeighing>()).promise,
    );

    first.resolve(STABLE_120);
    await expect.element(screen.getByText("0,120 kg")).toBeVisible();
    await expect.element(screen.getByText("Lectura estable")).toBeVisible();
    second.resolve(WEIGHING);
    await expect.element(screen.getByText("Pesando…")).toBeVisible();
    await expect.element(screen.getByText("0,120 kg")).toBeVisible();
    await expect.element(screen.getByText("$ 1.500,00")).toBeVisible();
    third.resolve(STABLE_250);
    await expect.element(screen.getByText("0,250 kg")).toBeVisible();
    await expect.element(screen.getByText("Lectura estable")).toBeVisible();
    expect(asking.mock.calls.every(([confirmed]) => confirmed === null)).toBe(true);
  });

  it("follows the bag as it settles: each unsteady weight and its amount while weighing, then the stable one", async () => {
    const first = deferred<ScaleWeighing>();
    const second = deferred<ScaleWeighing>();
    const third = deferred<ScaleWeighing>();
    const answers = [first, second, third];
    const { screen, asking, typed, onClose } = await renderModal(
      () => (answers.shift() ?? deferred<ScaleWeighing>()).promise,
    );

    first.resolve(UNSTEADY_80);
    await expect.element(screen.getByText("0,080 kg")).toBeVisible();
    await expect.element(screen.getByText("$ 1.000,00")).toBeVisible();
    await expect.element(screen.getByText("Pesando…")).toBeVisible();
    second.resolve(UNSTEADY_140);
    await expect.element(screen.getByText("0,140 kg")).toBeVisible();
    await expect.element(screen.getByText("$ 1.750,00")).toBeVisible();
    await expect.element(screen.getByText("Pesando…")).toBeVisible();
    await expect.element(screen.getByText("Lectura estable")).not.toBeInTheDocument();
    third.resolve(STABLE_150);
    await expect.element(screen.getByText("0,150 kg")).toBeVisible();
    await expect.element(screen.getByText("$ 1.875,00")).toBeVisible();
    await expect.element(screen.getByText("Lectura estable")).toBeVisible();
    await expect.element(screen.getByText("Pesando…")).not.toBeInTheDocument();
    expect(asking.mock.calls.every(([confirmed]) => confirmed === null)).toBe(true);
    expect(typed).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps confirming at an unsteady weight until a stable reading is shown, then takes that one", async () => {
    const unsteady = deferred<ScaleWeighing>();
    const stable = deferred<ScaleWeighing>();
    const answers = [unsteady, stable];
    const { screen, asking, onClose } = await renderModal((confirmed) =>
      confirmed === 150 ? Promise.resolve(TAKEN_150) : (answers.shift() ?? deferred()).promise,
    );
    unsteady.resolve(UNSTEADY_140);
    await expect.element(screen.getByText("0,140 kg")).toBeVisible();

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByRole("button", { name: "Confirmar peso" })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    stable.resolve(STABLE_150);
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(asking).toHaveBeenLastCalledWith(150);
    expect(asking).not.toHaveBeenCalledWith(140);
  });

  it("takes the weight shown and closes when the cashier confirms", async () => {
    const { screen, asking, onClose } = await renderModal(async (confirmed) =>
      confirmed === 250 ? TAKEN : STABLE_250,
    );
    await expect.element(screen.getByText("Lectura estable")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Confirmar peso" }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(asking).toHaveBeenCalledWith(250);
  });

  it("confirms with Enter", async () => {
    const { screen, asking, onClose } = await renderModal(async (confirmed) =>
      confirmed === 250 ? TAKEN : STABLE_250,
    );
    await expect.element(screen.getByText("Lectura estable")).toBeVisible();

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(asking).toHaveBeenCalledWith(250);
  });

  it("disables the confirmation while it waits for a stable reading to take", async () => {
    const taking = deferred<ScaleWeighing>();
    const { screen } = await renderModal((confirmed) =>
      confirmed === null ? Promise.resolve(STABLE_250) : taking.promise,
    );
    await expect.element(screen.getByText("Lectura estable")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Confirmar peso" }));

    await expect.element(screen.getByRole("button", { name: "Confirmar peso" })).toBeDisabled();
  });

  it("waits for the next stable reading, shows it and takes it when confirmed while the plate moves", async () => {
    const unconfirmed = scripted(WEIGHING, WEIGHING, STABLE_250);
    const taking = deferred<ScaleWeighing>();
    const { screen, asking, onClose } = await renderModal((confirmed) =>
      confirmed === 250 ? taking.promise : unconfirmed(),
    );

    await userEvent.click(screen.getByRole("button", { name: "Confirmar peso" }));

    await expect.element(screen.getByText("0,250 kg")).toBeVisible();
    taking.resolve(TAKEN);
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(asking).toHaveBeenLastCalledWith(250);
  });

  it("asks for a weight and keeps weighing when a weight of zero is confirmed", async () => {
    const { screen, asking, onClose } = await renderModal(async (confirmed) =>
      confirmed === null ? ZERO : { kind: "zero_weight" },
    );
    await expect.element(screen.getByText("Lectura estable")).toBeVisible();
    await expect.element(screen.getByText(ZERO_NOTE)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Confirmar peso" }));

    await expect.element(screen.getByText(ZERO_NOTE).first()).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Confirmar peso" })).toBeEnabled();
    const asked = asking.mock.calls.length;
    await expect.poll(() => asking.mock.calls.length).toBeGreaterThan(asked);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes without taking anything when cancelled", async () => {
    const { screen, asking, typed, onClose } = await renderModal(scripted(STABLE_250));
    await expect.element(screen.getByText("Lectura estable")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(asking.mock.calls.every(([confirmed]) => confirmed === null)).toBe(true);
    expect(typed).not.toHaveBeenCalled();
  });

  it("shows the typed weight form when the cashier chooses to type the weight, and adds what is typed", async () => {
    const { screen, typed } = await renderModal(async () => WEIGHING);

    await screen.getByRole("button", { name: "Tipear peso" }).click();
    await screen.getByRole("textbox", { name: "Peso en kg" }).fill("0,5");
    await screen.getByRole("button", { name: "Agregar" }).click();

    await expect.poll(() => typed.mock.calls).toEqual([[500]]);
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

  it("closes without adding the typed weight when the answer on its way took the reading", async () => {
    const answer = deferred<ScaleWeighing>();
    const { screen, typed, onClose } = await renderModal(() => answer.promise);

    await screen.getByRole("button", { name: "Tipear peso" }).click();
    await screen.getByRole("textbox", { name: "Peso en kg" }).fill("2");
    await screen.getByRole("button", { name: "Agregar" }).click();
    answer.resolve(TAKEN);

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(typed).not.toHaveBeenCalled();
  });

  it("adds a typed weight once the answer on its way was not a taken reading", async () => {
    const answer = deferred<ScaleWeighing>();
    const { screen, typed } = await renderModal(() => answer.promise);

    await screen.getByRole("button", { name: "Tipear peso" }).click();
    await screen.getByRole("textbox", { name: "Peso en kg" }).fill("2");
    await screen.getByRole("button", { name: "Agregar" }).click();
    answer.resolve(WEIGHING);

    await expect.poll(() => typed.mock.calls).toEqual([[2000]]);
  });

  it("shows the form that changes a line's weight with a note when the scale is not available", async () => {
    const { screen } = await renderModal(async () => ({ kind: "scale_unavailable" }), {
      currentWeight: 1000,
    });

    await expect
      .element(screen.getByRole("heading", { name: "Cambiar el peso de Queso cremoso" }))
      .toBeVisible();
    await expect.element(screen.getByText(UNAVAILABLE_NOTE).first()).toBeVisible();
  });

  it("types the new weight of a line in the form that changes it", async () => {
    const { screen, typed } = await renderModal(async () => WEIGHING, { currentWeight: 1000 });

    await screen.getByRole("button", { name: "Tipear peso" }).click();
    await expect
      .element(screen.getByRole("heading", { name: "Cambiar el peso de Queso cremoso" }))
      .toBeVisible();
    await screen.getByRole("textbox", { name: "Peso en kg" }).fill("2");
    await screen.getByRole("button", { name: "Cambiar peso" }).click();

    await expect.poll(() => typed.mock.calls).toEqual([[2000]]);
  });
});
