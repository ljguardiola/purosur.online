import type {
  InitialCountLine,
  RecordInitialCountLineOutcome,
  WeighCountedProductOutcome,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
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
    expect(weighing).toHaveBeenCalledWith(QUESO.product_id);
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
      weigh: async () => ({ kind: "weighed", weight_thousandths: 4400 }),
    });
    await expect
      .element(screen.getByRole("textbox", { name: "Cantidad contada" }))
      .toHaveValue("4,400");

    await confirm(screen);

    expect(recording).toHaveBeenCalledWith(QUESO.product_id, 4400, null);
    await vi.waitFor(() => expect(onRecorded).toHaveBeenCalledWith(RECORDED_LINE));
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
});
