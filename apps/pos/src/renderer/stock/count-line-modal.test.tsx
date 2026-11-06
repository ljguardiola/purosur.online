import type {
  InitialCountLine,
  RecordInitialCountLineOutcome,
  WeighCountedProductOutcome,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import { render } from "../shell/test-support/render-with-router";
import type { CountLineModalProps } from "./count-line-modal";
import { CountLineModal } from "./count-line-modal";

const YERBA = { product_id: "p1", name: "Yerba mate 1 kg", sale_unit: "UNIT" } as const;
const QUESO = { product_id: "p2", name: "Queso cremoso", sale_unit: "KG" } as const;

const RECORDED_LINE: InitialCountLine = {
  movement_id: "m1",
  product_id: "p2",
  product_name: "Queso cremoso",
  sale_unit: "KG",
  counted: 4400,
  expires_on: null,
};

async function renderModal({
  product = QUESO,
  recordLine = async (): Promise<RecordInitialCountLineOutcome> => ({
    kind: "recorded",
    line: RECORDED_LINE,
  }),
  weigh = async (): Promise<WeighCountedProductOutcome> => ({ kind: "scale_unavailable" }),
}: {
  product?: CountLineModalProps["product"];
  recordLine?: CountLineModalProps["recordLine"];
  weigh?: CountLineModalProps["weigh"];
} = {}) {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const recording = vi.fn(recordLine);
  const weighing = vi.fn(weigh);
  const onRecorded = vi.fn();
  const onNotOffered = vi.fn();
  const onSessionInvalid = vi.fn();
  const onClose = vi.fn();
  const screen = await render(
    <CountLineModal
      product={product}
      recordLine={recording}
      weigh={weighing}
      onRecorded={onRecorded}
      onNotOffered={onNotOffered}
      onSessionInvalid={onSessionInvalid}
      onClose={onClose}
    />,
  );
  return { screen, recording, weighing, onRecorded, onNotOffered, onSessionInvalid, onClose };
}

type Rendered = Awaited<ReturnType<typeof renderModal>>;

const ZERO_NOTE = "Poné el producto en la balanza o escribí el peso.";

function deferredOr(answer: WeighCountedProductOutcome | undefined) {
  return answer === undefined
    ? deferred<WeighCountedProductOutcome>().promise
    : Promise.resolve(answer);
}

async function typeCounted(screen: Rendered["screen"], typed: string) {
  await userEvent.fill(screen.getByRole("textbox", { name: "Cantidad contada" }), typed);
}

async function typeExpiry(screen: Rendered["screen"], typed: string) {
  await userEvent.click(
    screen
      .getByRole("group", { name: /^Vencimiento/ })
      .getByRole("spinbutton")
      .first(),
  );
  await userEvent.keyboard(typed);
}

function confirm(screen: Rendered["screen"]) {
  return userEvent.click(screen.getByRole("button", { name: "Confirmar línea" }));
}

describe("CountLineModal", () => {
  it("titles the window with the product sold by weight and offers the scale or typing", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByRole("dialog", { name: "Queso cremoso" })).toBeVisible();
    await expect.element(screen.getByText("Producto por peso")).toBeVisible();
    await expect
      .element(screen.getByText("Podés pesarlo en la balanza o escribir el peso."))
      .toBeVisible();
    await expect.element(screen.getByRole("group", { name: /^Vencimiento/ })).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Si el mismo producto tiene otro vencimiento, se carga como una línea aparte.",
        ),
      )
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
    await expect
      .element(screen.getByRole("textbox", { name: "Cantidad contada" }))
      .toHaveAttribute("inputmode", "decimal");
  });

  it("titles the window with the product sold by unit and gives no scale help", async () => {
    const { screen, weighing } = await renderModal({ product: YERBA });

    await expect.element(screen.getByText("Producto por unidad")).toBeVisible();
    await expect
      .element(screen.getByText("Podés pesarlo en la balanza o escribir el peso."))
      .not.toBeInTheDocument();
    expect(weighing).not.toHaveBeenCalled();
    await expect
      .element(screen.getByRole("textbox", { name: "Cantidad contada" }))
      .toHaveAttribute("inputmode", "numeric");
  });

  it("fills the weight with the stable reading of the scale", async () => {
    const { screen, weighing } = await renderModal({
      weigh: async () => ({ kind: "weighed", weight_thousandths: 4400 }),
    });

    await expect
      .element(screen.getByRole("textbox", { name: "Cantidad contada" }))
      .toHaveValue("4,400");
    expect(weighing).toHaveBeenCalledWith(QUESO.product_id, null);
  });

  it("shows that it is weighing until the first stable reading, then that the reading is stable", async () => {
    const first = deferred<WeighCountedProductOutcome>();
    const { screen } = await renderModal({
      weigh: (_productId, confirmed) =>
        confirmed === null ? first.promise : deferred<WeighCountedProductOutcome>().promise,
    });

    await expect.element(screen.getByText("Pesando…")).toBeVisible();
    first.resolve({ kind: "weighed", weight_thousandths: 1000 });

    await expect.element(screen.getByText("Lectura estable")).toBeVisible();
    await expect.element(screen.getByText("Pesando…")).not.toBeInTheDocument();
  });

  it("shows the unsteady weight in the field while weighing, without calling the reading stable", async () => {
    const { screen } = await renderModal({
      weigh: async () => ({ kind: "unsteady", weight_thousandths: 140 }),
    });

    await expect.element(screen.getByText("Pesando…")).toBeVisible();
    await expect
      .element(screen.getByRole("textbox", { name: "Cantidad contada" }))
      .toHaveValue("0,140");
    await expect.element(screen.getByText("Lectura estable")).not.toBeInTheDocument();
  });

  it("empties the field while weighing an unsteady reading out of range", async () => {
    const answers: WeighCountedProductOutcome[] = [
      { kind: "unsteady", weight_thousandths: 300 },
      { kind: "unsteady_out_of_range" },
    ];
    const asked = vi.fn(() => deferredOr(answers.shift()));
    const { screen } = await renderModal({ weigh: asked });

    await vi.waitFor(() => expect(asked).toHaveBeenCalledTimes(3));
    await expect.element(screen.getByRole("textbox", { name: "Cantidad contada" })).toHaveValue("");
    await expect.element(screen.getByText("Pesando…")).toBeVisible();
  });

  it("empties a stable weight from the field while weighing an unsteady reading out of range", async () => {
    const answers: WeighCountedProductOutcome[] = [
      { kind: "weighed", weight_thousandths: 300 },
      { kind: "unsteady_out_of_range" },
    ];
    const asked = vi.fn(() => deferredOr(answers.shift()));
    const { screen } = await renderModal({ weigh: asked });

    await vi.waitFor(() => expect(asked).toHaveBeenCalledTimes(3));
    await expect.element(screen.getByRole("textbox", { name: "Cantidad contada" })).toHaveValue("");
    await expect.element(screen.getByText("Pesando…")).toBeVisible();
  });

  it("empties an unsteady weight from the field when the scale becomes unavailable, recording nothing", async () => {
    const answers: WeighCountedProductOutcome[] = [
      { kind: "unsteady", weight_thousandths: 140 },
      { kind: "scale_unavailable" },
    ];
    const { screen, recording } = await renderModal({
      weigh: () => deferredOr(answers.shift()),
    });

    await expect
      .element(screen.getByText("La balanza no está disponible. Escribí el peso.").first())
      .toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Cantidad contada" })).toHaveValue("");
    await confirm(screen);
    expect(recording).not.toHaveBeenCalled();
  });

  it("shows that it is weighing, keeping the last stable weight, while the plate moves", async () => {
    const answers: WeighCountedProductOutcome[] = [
      { kind: "weighed", weight_thousandths: 1000 },
      { kind: "weighing" },
    ];
    const { screen } = await renderModal({
      weigh: () => deferredOr(answers.shift()),
    });

    await expect.element(screen.getByText("Pesando…")).toBeVisible();
    await expect
      .element(screen.getByRole("textbox", { name: "Cantidad contada" }))
      .toHaveValue("1,000");
  });

  it("follows the scale back to zero when the product is lifted", async () => {
    const first = deferred<WeighCountedProductOutcome>();
    const second = deferred<WeighCountedProductOutcome>();
    const answers = [first, second];
    const { screen } = await renderModal({
      weigh: () => (answers.shift() ?? deferred<WeighCountedProductOutcome>()).promise,
    });
    const field = screen.getByRole("textbox", { name: "Cantidad contada" });
    first.resolve({ kind: "weighed", weight_thousandths: 1000 });
    await expect.element(field).toHaveValue("1,000");
    second.resolve({ kind: "weighed", weight_thousandths: 0 });

    await expect.element(field).toHaveValue("0,000");
  });

  it("asks for a weight and records nothing when a weight of zero is confirmed", async () => {
    const { screen, recording, weighing } = await renderModal({
      weigh: async (_productId, confirmed) =>
        confirmed === null ? { kind: "weighed", weight_thousandths: 0 } : { kind: "zero_weight" },
    });
    await expect.element(screen.getByText("Lectura estable")).toBeVisible();
    await expect.element(screen.getByText(ZERO_NOTE)).not.toBeInTheDocument();

    await confirm(screen);

    await expect.element(screen.getByText(ZERO_NOTE).first()).toBeVisible();
    expect(weighing).toHaveBeenCalledWith(QUESO.product_id, 0);
    expect(recording).not.toHaveBeenCalled();
    await expect.element(screen.getByRole("button", { name: "Confirmar línea" })).toBeEnabled();
  });

  it("asks for a weight when the core refuses a zero weight before anything is confirmed", async () => {
    const { screen } = await renderModal({ weigh: async () => ({ kind: "zero_weight" }) });

    await expect.element(screen.getByText(ZERO_NOTE).first()).toBeVisible();
    await expect.element(screen.getByText("Lectura estable")).not.toBeInTheDocument();
  });

  it("reads the scale again and records the weight shown when it is confirmed", async () => {
    const { screen, recording, weighing } = await renderModal({
      weigh: async (_productId, confirmed) =>
        confirmed === 1000
          ? { kind: "confirmed", weight_thousandths: 1000 }
          : { kind: "weighed", weight_thousandths: 1000 },
    });
    await expect
      .element(screen.getByRole("textbox", { name: "Cantidad contada" }))
      .toHaveValue("1,000");

    await confirm(screen);

    await vi.waitFor(() => expect(recording).toHaveBeenCalledWith(QUESO.product_id, 1000, null));
    expect(weighing).toHaveBeenCalledWith(QUESO.product_id, 1000);
  });

  it("shows another stable weight the confirmation read and records it only once it is confirmed in turn", async () => {
    const first = deferred<WeighCountedProductOutcome>();
    const second = deferred<WeighCountedProductOutcome>();
    const answers = [first, second];
    const asked: unknown[] = [];
    const confirmedAnswer = deferred<WeighCountedProductOutcome>();
    const { screen, recording } = await renderModal({
      weigh: (_productId, confirmed) => {
        asked.push(confirmed);
        return confirmed === 1500
          ? confirmedAnswer.promise
          : (answers.shift() ?? deferred<WeighCountedProductOutcome>()).promise;
      },
    });
    const field = screen.getByRole("textbox", { name: "Cantidad contada" });
    first.resolve({ kind: "weighed", weight_thousandths: 1000 });
    await expect.element(field).toHaveValue("1,000");

    await confirm(screen);
    second.resolve({ kind: "weighed", weight_thousandths: 1500 });

    await expect.element(field).toHaveValue("1,500");
    await vi.waitFor(() => expect(asked).toContain(1500));
    expect(recording).not.toHaveBeenCalled();
    confirmedAnswer.resolve({ kind: "confirmed", weight_thousandths: 1500 });
    await vi.waitFor(() => expect(recording).toHaveBeenCalledWith(QUESO.product_id, 1500, null));
    expect(recording).toHaveBeenCalledOnce();
  });

  it("waits for the first stable reading when confirmed before any, recording nothing meanwhile", async () => {
    const answers: WeighCountedProductOutcome[] = [{ kind: "weighing" }, { kind: "weighing" }];
    const stable = deferred<WeighCountedProductOutcome>();
    const { screen, recording } = await renderModal({
      weigh: (_productId, confirmed) =>
        confirmed === 1200
          ? Promise.resolve({ kind: "confirmed", weight_thousandths: 1200 })
          : answers.length > 0
            ? deferredOr(answers.shift())
            : stable.promise,
    });
    await expect.element(screen.getByText("Pesando…")).toBeVisible();

    await confirm(screen);

    expect(recording).not.toHaveBeenCalled();
    await expect
      .element(screen.getByRole("textbox", { name: "Cantidad contada" }))
      .not.toHaveAttribute("aria-invalid", "true");
    stable.resolve({ kind: "weighed", weight_thousandths: 1200 });
    await vi.waitFor(() => expect(recording).toHaveBeenCalledWith(QUESO.product_id, 1200, null));
    expect(recording).toHaveBeenCalledOnce();
  });

  it("follows each new stable reading of the scale", async () => {
    const readings = [1000, 1500];
    const { screen } = await renderModal({
      weigh: async () => ({ kind: "weighed", weight_thousandths: readings.shift() ?? 1500 }),
    });
    const field = screen.getByRole("textbox", { name: "Cantidad contada" });

    await expect.element(field).toHaveValue("1,500");
  });

  it("stops following the scale once the cashier types the weight", async () => {
    const answers: WeighCountedProductOutcome[] = [{ kind: "weighed", weight_thousandths: 1000 }];
    const { screen, weighing, recording } = await renderModal({
      weigh: () => deferredOr(answers.shift()),
    });
    const field = screen.getByRole("textbox", { name: "Cantidad contada" });
    await expect.element(field).toHaveValue("1,000");

    await typeCounted(screen, "2");
    const asked = weighing.mock.calls.length;
    await confirm(screen);

    expect(weighing).toHaveBeenCalledTimes(asked);
    await expect.element(field).toHaveValue("2");
    await confirm(screen);
    expect(recording).toHaveBeenCalledWith(QUESO.product_id, 2000, null);
  });

  it("waits for the next stable reading when confirmed while the plate moves", async () => {
    const answers = [
      deferred<WeighCountedProductOutcome>(),
      deferred<WeighCountedProductOutcome>(),
      deferred<WeighCountedProductOutcome>(),
      deferred<WeighCountedProductOutcome>(),
    ];
    let asked = 0;
    const { screen, weighing, recording } = await renderModal({
      weigh: () => (answers[asked++] ?? deferred<WeighCountedProductOutcome>()).promise,
    });
    const field = screen.getByRole("textbox", { name: "Cantidad contada" });
    answers[0]?.resolve({ kind: "weighed", weight_thousandths: 1000 });
    await expect.element(field).toHaveValue("1,000");
    answers[1]?.resolve({ kind: "weighing" });
    await vi.waitFor(() => expect(weighing.mock.calls.length).toBe(3));

    await confirm(screen);
    expect(recording).not.toHaveBeenCalled();
    answers[2]?.resolve({ kind: "weighing" });
    await vi.waitFor(() => expect(weighing.mock.calls.length).toBe(4));
    expect(weighing).toHaveBeenLastCalledWith(QUESO.product_id, 1000);
    answers[3]?.resolve({ kind: "confirmed", weight_thousandths: 1000 });

    await vi.waitFor(() => expect(recording).toHaveBeenCalledWith(QUESO.product_id, 1000, null));
    expect(recording).toHaveBeenCalledOnce();
  });

  it("records what is typed at once, without waiting for the scale, when the plate moves before any stable reading", async () => {
    const { screen, recording } = await renderModal({
      weigh: async () => ({ kind: "weighing" }),
    });
    await typeCounted(screen, "2");

    await confirm(screen);

    expect(recording).toHaveBeenCalledWith(QUESO.product_id, 2000, null);
  });

  it("tells the scale is unavailable and lets the weight be typed", async () => {
    const { screen, recording } = await renderModal();

    await expect
      .element(screen.getByText("La balanza no está disponible. Escribí el peso.").first())
      .toBeVisible();
    await typeCounted(screen, "2,5");
    await confirm(screen);

    expect(recording).toHaveBeenCalledWith(QUESO.product_id, 2500, null);
  });

  it("records the weight read from the scale when confirmed", async () => {
    const { screen, recording, onRecorded } = await renderModal({
      weigh: async (_productId, confirmed) => ({
        kind: confirmed === 4400 ? "confirmed" : "weighed",
        weight_thousandths: 4400,
      }),
    });
    await expect
      .element(screen.getByRole("textbox", { name: "Cantidad contada" }))
      .toHaveValue("4,400");

    await confirm(screen);

    await vi.waitFor(() => expect(onRecorded).toHaveBeenCalledWith(RECORDED_LINE));
    expect(recording).toHaveBeenCalledWith(QUESO.product_id, 4400, null);
  });

  it("records the units of a product sold by unit with the expiry that was chosen", async () => {
    const { screen, recording } = await renderModal({ product: YERBA });

    await typeCounted(screen, "24");
    await typeExpiry(screen, "03122026");
    await confirm(screen);

    expect(recording).toHaveBeenCalledWith(YERBA.product_id, 24_000, "2026-12-03");
  });

  it("asks for a quantity before recording anything", async () => {
    const { screen, recording } = await renderModal({ product: YERBA });

    await confirm(screen);

    await expect
      .element(screen.getByText("Ingresá una cantidad entera de unidades, mayor a 0."))
      .toBeVisible();
    expect(recording).not.toHaveBeenCalled();
  });

  it("asks again for the quantity when the core refuses it", async () => {
    const { screen, onRecorded } = await renderModal({
      product: YERBA,
      recordLine: async () => ({ kind: "invalid_quantity" }),
    });
    await typeCounted(screen, "24");

    await confirm(screen);

    await expect
      .element(screen.getByText("Ingresá una cantidad entera de unidades, mayor a 0."))
      .toBeVisible();
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("asks again for the expiry when the core refuses it", async () => {
    const { screen } = await renderModal({
      product: YERBA,
      recordLine: async () => ({ kind: "invalid_expiry" }),
    });
    await typeCounted(screen, "24");

    await confirm(screen);

    await expect.element(screen.getByText("Elegí un vencimiento válido.")).toBeVisible();
  });

  it("tells the product can no longer be counted when the core does not know it", async () => {
    const { screen } = await renderModal({
      product: YERBA,
      recordLine: async () => ({ kind: "unknown_product" }),
    });
    await typeCounted(screen, "24");

    await confirm(screen);

    await expect
      .element(screen.getByText("Este producto ya no se puede contar.").first())
      .toBeVisible();
  });

  it("tells the person may no longer load the count", async () => {
    const { screen } = await renderModal({
      product: YERBA,
      recordLine: async () => ({ kind: "not_permitted" }),
    });
    await typeCounted(screen, "24");

    await confirm(screen);

    await expect
      .element(screen.getByText("Ya no tenés permiso para cargar el inventario inicial.").first())
      .toBeVisible();
  });

  it("tells the line was not saved when the core cannot answer, keeping what was typed", async () => {
    const { screen } = await renderModal({
      product: YERBA,
      recordLine: async () => ({ kind: "unavailable" }),
    });
    await typeCounted(screen, "24");

    await confirm(screen);

    await expect
      .element(screen.getByText("No se pudo guardar la línea. Probá de nuevo.").first())
      .toBeVisible();
    await expect
      .element(screen.getByRole("textbox", { name: "Cantidad contada" }))
      .toHaveValue("24");
  });

  it("reports that the count is no longer offered", async () => {
    const { screen, onNotOffered } = await renderModal({
      product: YERBA,
      recordLine: async () => ({ kind: "not_offered" }),
    });
    await typeCounted(screen, "24");

    await confirm(screen);

    await vi.waitFor(() => expect(onNotOffered).toHaveBeenCalledOnce());
  });

  it("reports that the session ended", async () => {
    const { screen, onSessionInvalid } = await renderModal({
      product: YERBA,
      recordLine: async () => ({ kind: "not_signed_in" }),
    });
    await typeCounted(screen, "24");

    await confirm(screen);

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });

  it("closes without recording when cancelled", async () => {
    const { screen, recording, onClose } = await renderModal({ product: YERBA });

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(recording).not.toHaveBeenCalled();
  });

  it("groups thousands and takes a typed dot as the decimal comma", async () => {
    const { screen } = await renderModal();
    const field = screen.getByRole("textbox", { name: "Cantidad contada" });
    await userEvent.clear(field);
    await userEvent.type(field, "1234.5");

    await expect.element(field).toHaveValue("1.234,5");
  });
});
