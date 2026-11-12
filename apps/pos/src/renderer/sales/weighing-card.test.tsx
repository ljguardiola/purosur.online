import { expectNoAccessibilityViolations, tokenRgb } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { deferred } from "./test-support/sale-screen";
import type { ScaleWeighing, WaitingEntry } from "./weighing-card";
import { WeighingCard } from "./weighing-card";

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

type CardOptions = {
  currentWeight?: number;
  unitPrice?: number | null;
  waiting?: WaitingEntry[];
};

async function renderCard(
  weigh: (confirmedWeightThousandths: number | null) => Promise<ScaleWeighing>,
  { currentWeight, unitPrice = 1_250_000, waiting = [] }: CardOptions = {},
) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const asking = vi.fn(weigh);
  const typed = vi.fn(async (_weight: number): Promise<"invalid_weight" | "done"> => "done");
  const onClose = vi.fn();
  const onDiscardWaiting = vi.fn();
  const onReading = vi.fn();
  const screen = await render(
    <WeighingCard
      productName="Queso cremoso"
      unitPrice={unitPrice}
      weigh={asking}
      typedWeight={typed}
      currentWeight={currentWeight}
      waiting={waiting}
      onDiscardWaiting={onDiscardWaiting}
      onReading={onReading}
      onClose={onClose}
    />,
  );
  return { screen, asking, typed, onClose, onDiscardWaiting, onReading };
}

describe("WeighingCard", () => {
  it("shows that it is weighing, with no weight and no amount, before the first stable reading", async () => {
    const { screen } = await renderCard(async () => WEIGHING);

    await expect.element(screen.getByRole("heading", { name: "Queso cremoso" })).toBeVisible();
    await expect.element(screen.getByText("Moviéndose")).toBeVisible();
    await expect.element(screen.getByText("0,000 kg")).toBeVisible();
    await expect.element(screen.getByText("$ 0,00")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Escribir peso" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cancelar" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Confirmar" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the stable reading with its weight and amount without closing", async () => {
    const { screen, onClose } = await renderCard(async () => STABLE_250);

    await expect.element(screen.getByText("Estable")).toBeVisible();
    await expect.element(screen.getByText("0,250 kg")).toBeVisible();
    await expect.element(screen.getByText("$ 3.125,00")).toBeVisible();
    await expect.element(screen.getByText("Moviéndose")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("follows the bag: the stable weight, the movement with the last weight, the next stable weight", async () => {
    const first = deferred<ScaleWeighing>();
    const second = deferred<ScaleWeighing>();
    const third = deferred<ScaleWeighing>();
    const answers = [first, second, third];
    const { screen, asking } = await renderCard(
      () => (answers.shift() ?? deferred<ScaleWeighing>()).promise,
    );

    first.resolve(STABLE_120);
    await expect.element(screen.getByText("0,120 kg")).toBeVisible();
    await expect.element(screen.getByText("Estable")).toBeVisible();
    second.resolve(WEIGHING);
    await expect.element(screen.getByText("Moviéndose")).toBeVisible();
    await expect.element(screen.getByText("0,120 kg")).toBeVisible();
    await expect.element(screen.getByText("$ 1.500,00")).toBeVisible();
    third.resolve(STABLE_250);
    await expect.element(screen.getByText("0,250 kg")).toBeVisible();
    await expect.element(screen.getByText("Estable")).toBeVisible();
    expect(asking.mock.calls.every(([confirmed]) => confirmed === null)).toBe(true);
  });

  it("follows the bag as it settles: each unsteady weight and its amount while weighing, then the stable one", async () => {
    const first = deferred<ScaleWeighing>();
    const second = deferred<ScaleWeighing>();
    const third = deferred<ScaleWeighing>();
    const answers = [first, second, third];
    const { screen, asking, typed, onClose } = await renderCard(
      () => (answers.shift() ?? deferred<ScaleWeighing>()).promise,
    );

    first.resolve(UNSTEADY_80);
    await expect.element(screen.getByText("0,080 kg")).toBeVisible();
    await expect.element(screen.getByText("$ 1.000,00")).toBeVisible();
    await expect.element(screen.getByText("Moviéndose")).toBeVisible();
    second.resolve(UNSTEADY_140);
    await expect.element(screen.getByText("0,140 kg")).toBeVisible();
    await expect.element(screen.getByText("$ 1.750,00")).toBeVisible();
    await expect.element(screen.getByText("Moviéndose")).toBeVisible();
    await expect.element(screen.getByText("Estable")).not.toBeInTheDocument();
    third.resolve(STABLE_150);
    await expect.element(screen.getByText("0,150 kg")).toBeVisible();
    await expect.element(screen.getByText("$ 1.875,00")).toBeVisible();
    await expect.element(screen.getByText("Estable")).toBeVisible();
    await expect.element(screen.getByText("Moviéndose")).not.toBeInTheDocument();
    expect(asking.mock.calls.every(([confirmed]) => confirmed === null)).toBe(true);
    expect(typed).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows that it is weighing with no weight and no amount for an unsteady reading out of range", async () => {
    const { screen } = await renderCard(scripted(UNSTEADY_140, { kind: "unsteady_out_of_range" }));

    await expect.element(screen.getByText("0,000 kg")).toBeVisible();
    await expect.element(screen.getByText("$ 0,00")).toBeVisible();
    await expect.element(screen.getByText("Moviéndose")).toBeVisible();
    await expect.element(screen.getByText("0,140 kg")).not.toBeInTheDocument();
  });

  it("takes the weight shown and closes when the cashier confirms", async () => {
    const { screen, asking, onClose } = await renderCard(async (confirmed) =>
      confirmed === 250 ? TAKEN : STABLE_250,
    );
    await expect.element(screen.getByText("Estable")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(asking).toHaveBeenCalledWith(250);
  });

  it("confirms with Enter", async () => {
    const { screen, asking, onClose } = await renderCard(async (confirmed) =>
      confirmed === 250 ? TAKEN : STABLE_250,
    );
    await expect.element(screen.getByText("Estable")).toBeVisible();

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(asking).toHaveBeenCalledWith(250);
  });

  it("disables the confirmation while it waits for the scale to take the stable reading", async () => {
    const taking = deferred<ScaleWeighing>();
    const { screen } = await renderCard((confirmed) =>
      confirmed === null ? Promise.resolve(STABLE_250) : taking.promise,
    );
    await expect.element(screen.getByText("Estable")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await expect.element(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("asks for a weight and keeps weighing when a weight of zero is confirmed", async () => {
    const { screen, asking, onClose } = await renderCard(async (confirmed) =>
      confirmed === null ? ZERO : { kind: "zero_weight" },
    );
    await expect.element(screen.getByText("Estable")).toBeVisible();
    await expect.element(screen.getByText(ZERO_NOTE)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await expect.element(screen.getByText(ZERO_NOTE).first()).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled();
    const asked = asking.mock.calls.length;
    await expect.poll(() => asking.mock.calls.length).toBeGreaterThan(asked);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes without taking anything when cancelled", async () => {
    const { screen, asking, typed, onClose } = await renderCard(scripted(STABLE_250));
    await expect.element(screen.getByText("Estable")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(asking.mock.calls.every(([confirmed]) => confirmed === null)).toBe(true);
    expect(typed).not.toHaveBeenCalled();
  });

  it("shows the typed weight form when the cashier chooses to type the weight, and adds what is typed", async () => {
    const { screen, typed } = await renderCard(async () => WEIGHING);

    await screen.getByRole("button", { name: "Escribir peso" }).click();
    await screen.getByRole("textbox", { name: "Peso en kg" }).fill("0,5");
    await screen.getByRole("button", { name: "Agregar" }).click();

    await expect.poll(() => typed.mock.calls).toEqual([[500]]);
    await expect.element(screen.getByText(UNAVAILABLE_NOTE).first()).not.toBeInTheDocument();
  });

  it("shows the typed weight form with a note when the scale is not available", async () => {
    const { screen } = await renderCard(async () => ({ kind: "scale_unavailable" }));

    await expect.element(screen.getByText(UNAVAILABLE_NOTE).first()).toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Peso en kg" })).toBeVisible();
  });

  it("closes without adding the typed weight when the answer on its way took the reading", async () => {
    const answer = deferred<ScaleWeighing>();
    const { screen, typed, onClose } = await renderCard(() => answer.promise);

    await screen.getByRole("button", { name: "Escribir peso" }).click();
    await screen.getByRole("textbox", { name: "Peso en kg" }).fill("2");
    await screen.getByRole("button", { name: "Agregar" }).click();
    answer.resolve(TAKEN);

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(typed).not.toHaveBeenCalled();
  });

  it("adds a typed weight once the answer on its way was not a taken reading", async () => {
    const answer = deferred<ScaleWeighing>();
    const { screen, typed } = await renderCard(() => answer.promise);

    await screen.getByRole("button", { name: "Escribir peso" }).click();
    await screen.getByRole("textbox", { name: "Peso en kg" }).fill("2");
    await screen.getByRole("button", { name: "Agregar" }).click();
    answer.resolve(WEIGHING);

    await expect.poll(() => typed.mock.calls).toEqual([[2000]]);
  });

  it("shows the form that changes a line's weight with a note when the scale is not available", async () => {
    const { screen } = await renderCard(async () => ({ kind: "scale_unavailable" }), {
      currentWeight: 1000,
    });

    await expect
      .element(screen.getByRole("heading", { name: "Cambiar el peso de Queso cremoso" }))
      .toBeVisible();
    await expect.element(screen.getByText(UNAVAILABLE_NOTE).first()).toBeVisible();
  });

  it("types the new weight of a line in the form that changes it", async () => {
    const { screen, typed } = await renderCard(async () => WEIGHING, { currentWeight: 1000 });

    await screen.getByRole("button", { name: "Escribir peso" }).click();
    await expect
      .element(screen.getByRole("heading", { name: "Cambiar el peso de Queso cremoso" }))
      .toBeVisible();
    await screen.getByRole("textbox", { name: "Peso en kg" }).fill("2");
    await screen.getByRole("button", { name: "Cambiar peso" }).click();

    await expect.poll(() => typed.mock.calls).toEqual([[2000]]);
  });

  it("shows the product's name as the title with its unit price below", async () => {
    const { screen } = await renderCard(async () => WEIGHING);

    await expect.element(screen.getByRole("heading", { name: "Queso cremoso" })).toBeVisible();
    await expect.element(screen.getByText("$ 12.500,00 / kg")).toBeVisible();
  });

  it("shows no unit price when it has none", async () => {
    const { screen } = await renderCard(async () => WEIGHING, { unitPrice: null });

    await expect.element(screen.getByRole("heading", { name: "Queso cremoso" })).toBeVisible();
    await expect.element(screen.getByText("/ kg", { exact: false })).not.toBeInTheDocument();
  });

  it("labels the figures Peso and Importe", async () => {
    const { screen } = await renderCard(async () => STABLE_250);

    await expect.element(screen.getByText("Peso", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Importe", { exact: true })).toBeVisible();
  });

  it("enables the confirmation only on a stable reading", async () => {
    const unsteady = deferred<ScaleWeighing>();
    const stable = deferred<ScaleWeighing>();
    const answers = [unsteady, stable];
    const { screen, asking } = await renderCard(
      () => (answers.shift() ?? deferred<ScaleWeighing>()).promise,
    );

    await expect.element(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    unsteady.resolve(UNSTEADY_140);
    await expect.element(screen.getByText("0,140 kg")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    stable.resolve(STABLE_150);
    await expect.element(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled();
    expect(asking.mock.calls.every(([confirmed]) => confirmed === null)).toBe(true);
  });

  it("does nothing on Enter while the reading is moving", async () => {
    const { screen, asking, onClose } = await renderCard(scripted(UNSTEADY_140));
    await expect.element(screen.getByText("0,140 kg")).toBeVisible();

    await userEvent.keyboard("{Enter}");

    expect(asking.mock.calls.every(([confirmed]) => confirmed === null)).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the keys of its actions on their buttons", async () => {
    const { screen } = await renderCard(async () => STABLE_250);
    const keyOf = (name: string) =>
      screen.getByRole("button", { name, exact: true }).element().querySelector("kbd")?.textContent;

    await expect.element(screen.getByRole("button", { name: "Confirmar" })).toBeVisible();
    expect(keyOf("Confirmar")).toBe("Enter");
    expect(keyOf("Escribir peso")).toBe("F5");
    expect(keyOf("Cancelar")).toBe("Esc");
  });

  it("draws the type-weight button on the surface with no icon besides its key", async () => {
    const { screen } = await renderCard(async () => STABLE_250);
    const typeWeight = screen.getByRole("button", { name: "Escribir peso" });
    await expect.element(typeWeight).toBeEnabled();

    const icons = [...typeWeight.element().querySelectorAll("svg")].filter(
      (icon) => icon.closest("kbd") === null,
    );
    expect(icons).toEqual([]);
    expect(getComputedStyle(typeWeight.element()).backgroundColor).toBe(tokenRgb("surface"));
  });

  it("opens the typed weight form with F5", async () => {
    const { screen, typed } = await renderCard(async () => STABLE_250);
    await expect.element(screen.getByText("Estable")).toBeVisible();

    await userEvent.keyboard("{F5}");
    await screen.getByRole("textbox", { name: "Peso en kg" }).fill("0,5");
    await screen.getByRole("button", { name: "Agregar" }).click();

    await expect.poll(() => typed.mock.calls).toEqual([[500]]);
  });

  it("leaves Enter to the focused button", async () => {
    const { screen, asking, onClose, onDiscardWaiting } = await renderCard(
      async (confirmed) => (confirmed === 250 ? TAKEN : STABLE_250),
      { waiting: [{ productId: "p2", name: "Aceite", saleUnit: "UNIT", unitPrice: 940_000 }] },
    );
    await expect.element(screen.getByText("Estable")).toBeVisible();
    screen.getByRole("button", { name: "Descartar" }).element().focus();

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(onDiscardWaiting).toHaveBeenCalledOnce());
    expect(onClose).not.toHaveBeenCalled();
    expect(asking.mock.calls.every(([confirmed]) => confirmed === null)).toBe(true);
  });

  it("closes without taking anything on Esc", async () => {
    const { screen, asking, typed, onClose } = await renderCard(scripted(STABLE_250));
    await expect.element(screen.getByText("Estable")).toBeVisible();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(asking.mock.calls.every(([confirmed]) => confirmed === null)).toBe(true);
    expect(typed).not.toHaveBeenCalled();
  });

  it("answers its keys no more while the typed weight form is open", async () => {
    const { screen, onClose, onDiscardWaiting } = await renderCard(async () => STABLE_250, {
      waiting: [{ productId: "p2", name: "Aceite", saleUnit: "UNIT", unitPrice: 940_000 }],
    });
    await screen.getByRole("button", { name: "Escribir peso" }).click();
    await expect.element(screen.getByRole("textbox", { name: "Peso en kg" })).toBeVisible();

    await userEvent.keyboard("{Delete}");

    expect(onDiscardWaiting).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  describe("the products waiting", () => {
    const AZUCAR: WaitingEntry = {
      productId: "p-azucar",
      name: "Azúcar 1 kg",
      saleUnit: "UNIT",
      unitPrice: 120_000,
    };
    const ACEITE: WaitingEntry = {
      productId: "p-aceite",
      name: "Aceite de oliva extra virgen 500 ml",
      saleUnit: "UNIT",
      unitPrice: 940_000,
    };
    const PASAS: WaitingEntry = {
      productId: "p-pasas",
      name: "Pasas de uva",
      saleUnit: "KG",
      unitPrice: 780_000,
    };

    it("shows none when nothing waits", async () => {
      const { screen } = await renderCard(async () => WEIGHING);

      await expect.element(screen.getByText("En espera")).not.toBeInTheDocument();
      await expect
        .element(screen.getByRole("button", { name: "Descartar" }))
        .not.toBeInTheDocument();
    });

    it("shows the first waiting product with its unit price and Descartar with Supr", async () => {
      const { screen } = await renderCard(async () => WEIGHING, { waiting: [ACEITE, PASAS] });

      await expect.element(screen.getByText("En espera")).toBeVisible();
      await expect.element(screen.getByText("Aceite de oliva extra virgen 500 ml")).toBeVisible();
      await expect.element(screen.getByText("$ 9.400,00 / u", { exact: false })).toBeVisible();
      await expect.element(screen.getByText("Pasas de uva")).not.toBeInTheDocument();
      const discard = screen.getByRole("button", { name: "Descartar", exact: true });
      expect(discard.element().querySelector("kbd")?.textContent).toBe("Supr");
    });

    it("says how many others wait after the first one", async () => {
      const { screen } = await renderCard(async () => WEIGHING, {
        waiting: [ACEITE, PASAS, AZUCAR],
      });

      await expect.element(screen.getByText("y 2 más")).toBeVisible();
    });

    it("says nothing about others when only one waits", async () => {
      const { screen } = await renderCard(async () => WEIGHING, { waiting: [ACEITE] });

      await expect.element(screen.getByText("Aceite de oliva extra virgen 500 ml")).toBeVisible();
      await expect.element(screen.getByText("más", { exact: false })).not.toBeInTheDocument();
    });

    it("shows a waiting product sold by weight with its price per kilo", async () => {
      const { screen } = await renderCard(async () => WEIGHING, { waiting: [PASAS] });

      await expect.element(screen.getByText("$ 7.800,00 / kg", { exact: false })).toBeVisible();
    });

    it("shows only the name of a waiting product without a price", async () => {
      const { screen } = await renderCard(async () => WEIGHING, {
        waiting: [{ ...AZUCAR, unitPrice: null }],
      });

      await expect.element(screen.getByText("Azúcar 1 kg")).toBeVisible();
      await expect.element(screen.getByText("·", { exact: false })).not.toBeInTheDocument();
    });

    it("discards the first one when Descartar is pressed", async () => {
      const { screen, onDiscardWaiting } = await renderCard(async () => WEIGHING, {
        waiting: [ACEITE],
      });

      await screen.getByRole("button", { name: "Descartar" }).click();

      expect(onDiscardWaiting).toHaveBeenCalledOnce();
    });

    it("discards the first one with Supr", async () => {
      const { screen, onDiscardWaiting, onClose } = await renderCard(async () => WEIGHING, {
        waiting: [ACEITE],
      });
      await expect.element(screen.getByText("En espera")).toBeVisible();

      await userEvent.keyboard("{Delete}");

      expect(onDiscardWaiting).toHaveBeenCalledOnce();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("does nothing on Supr when nothing waits", async () => {
      const { screen, onDiscardWaiting } = await renderCard(async () => WEIGHING);
      await expect.element(screen.getByRole("heading", { name: "Queso cremoso" })).toBeVisible();

      await userEvent.keyboard("{Delete}");

      expect(onDiscardWaiting).not.toHaveBeenCalled();
    });
  });

  describe("the reading it reports", () => {
    it("reports the weight shown as settled once it is stable", async () => {
      const { onReading } = await renderCard(async () => STABLE_250);

      await vi.waitFor(() =>
        expect(onReading).toHaveBeenLastCalledWith({ weightThousandths: 250, settled: true }),
      );
    });

    it("reports an unsteady weight as not settled", async () => {
      const { onReading } = await renderCard(async () => UNSTEADY_140);

      await vi.waitFor(() =>
        expect(onReading).toHaveBeenLastCalledWith({ weightThousandths: 140, settled: false }),
      );
    });

    it("reports the last weight as not settled while the plate moves", async () => {
      const { onReading } = await renderCard(scripted(STABLE_120, WEIGHING));

      await vi.waitFor(() =>
        expect(onReading).toHaveBeenLastCalledWith({ weightThousandths: 120, settled: false }),
      );
    });

    it("reports no weight as not settled before the first reading", async () => {
      const { onReading } = await renderCard(async () => WEIGHING);

      await vi.waitFor(() =>
        expect(onReading).toHaveBeenLastCalledWith({ weightThousandths: 0, settled: false }),
      );
    });

    it("reports no reading once the scale is not read any more", async () => {
      const { screen, onReading } = await renderCard(async () => STABLE_250);
      await expect.element(screen.getByText("Estable")).toBeVisible();

      await screen.getByRole("button", { name: "Escribir peso" }).click();

      await vi.waitFor(() => expect(onReading).toHaveBeenLastCalledWith(undefined));
    });

    it("reports no reading once it is gone", async () => {
      const { screen, onReading } = await renderCard(async () => STABLE_250);
      await expect.element(screen.getByText("Estable")).toBeVisible();

      await screen.unmount();

      expect(onReading).toHaveBeenLastCalledWith(undefined);
    });
  });
});
