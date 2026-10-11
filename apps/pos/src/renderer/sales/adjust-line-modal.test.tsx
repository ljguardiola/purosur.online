import type {
  AdjustSaleLineOutcome,
  Authorization,
  ManualAdjustmentRequest,
  OpenSale,
  PreviewSaleLineAdjustmentOutcome,
  SignInUser,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SignedInPerson } from "../shell/signed-in-person";
import { render } from "../shell/test-support/render-with-router";
import { AdjustLineModal } from "./adjust-line-modal";
import { deferred, SALE_OF_YERBA } from "./test-support/sale-screen";

const PERSON: SignedInPerson = { user_id: "u1", first_name: "Ada", abilities: [] };
const AUTHORIZERS: SignInUser[] = [
  { id: "u3", first_name: "Sofía" },
  { id: "u2", first_name: "Grace" },
];
const APPLY = /^Aplicar el (descuento|precio)$/;
const REASON = "Motivo";
const CHANGED: AdjustSaleLineOutcome = {
  kind: "changed",
  sale: SALE_OF_YERBA,
  authorized_by: null,
};

type Props = {
  previewAdjustment?: (
    lineId: string,
    adjustment: ManualAdjustmentRequest,
  ) => Promise<PreviewSaleLineAdjustmentOutcome>;
  authorizationRequired?: boolean;
  saleUnit?: "UNIT" | "KG";
  quantity?: number;
  adjustSaleLine?: (
    lineId: string,
    adjustment: ManualAdjustmentRequest,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<AdjustSaleLineOutcome>;
};

async function renderModal({
  authorizationRequired = false,
  saleUnit = "UNIT",
  quantity = 2,
  adjustSaleLine = async () => CHANGED,
  previewAdjustment = async () => ({ kind: "unknown_line" }),
}: Props = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const adjust = vi.fn(adjustSaleLine);
  const preview = vi.fn(previewAdjustment);
  const requested: string[] = [];
  const loadAuthorizers = async (permission: string) => {
    requested.push(permission);
    return AUTHORIZERS;
  };
  const handlers = {
    onAdjusted: vi.fn<(sale: OpenSale) => void>(),
    onSaleGone: vi.fn(),
    onSessionInvalid: vi.fn(),
    onClose: vi.fn(),
  };
  const screen = await render(
    <AdjustLineModal
      lineId="line-1"
      productName="Yerba mate 1 kg"
      listUnitPrice={238_000}
      quantity={quantity}
      saleUnit={saleUnit}
      authorizationRequired={authorizationRequired}
      person={PERSON}
      loadAuthorizers={loadAuthorizers}
      adjustSaleLine={adjust}
      previewAdjustment={preview}
      {...handlers}
    />,
  );
  return { screen, adjust, preview, requested, ...handlers };
}

type Screen = Awaited<ReturnType<typeof renderModal>>["screen"];

async function typeReason(screen: Screen, reason: string) {
  await userEvent.fill(screen.getByRole("textbox", { name: REASON }), reason);
}

async function typeValue(screen: Screen, label: string, value: string) {
  await userEvent.fill(screen.getByRole("textbox", { name: label }), value);
}

async function authorizeAs(screen: Screen, firstName: string, pin: string) {
  await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));
  await userEvent.click(screen.getByRole("option", { name: firstName }));
  await userEvent.type(screen.getByLabelText("PIN"), pin);
}

async function typePrice(screen: Screen, value: string) {
  await chooseKind(screen, "Precio nuevo");
  await typeValue(screen, "Precio nuevo", value);
}

async function chooseKind(screen: Screen, name: string) {
  const input = screen.getByRole("radio", { name }).element();
  const label = input.closest("label");
  if (label === null) {
    throw new Error(`no label found for the option `);
  }
  await userEvent.click(label);
}

async function apply(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: APPLY }));
}

describe("AdjustLineModal", () => {
  it("names the product and shows its list price", async () => {
    const { screen } = await renderModal();

    await expect
      .element(screen.getByRole("heading", { name: "Cambiar el precio de la línea" }))
      .toBeVisible();
    await expect.element(screen.getByText("YERBA MATE 1 KG · 2 U")).toBeVisible();
    await expect.element(screen.getByText("$ 2.380,00")).toBeVisible();
    await expectNoAccessibilityViolations(document.body);
  });

  it("starts on a percentage discount, saying it replaces the line's promotion", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByRole("radio", { name: "Descuento" })).toBeChecked();
    await expect.element(screen.getByRole("radio", { name: "%" })).toBeChecked();
    await expect
      .element(screen.getByRole("textbox", { name: "Porcentaje de descuento" }))
      .toBeVisible();
    await expect
      .element(screen.getByText("Reemplaza la promoción de la línea, si tiene."))
      .toBeVisible();
  });

  it("offers only the price when choosing a new price, with no promotion hint", async () => {
    const { screen } = await renderModal();

    await chooseKind(screen, "Precio nuevo");

    await expect.element(screen.getByRole("textbox", { name: "Precio nuevo" })).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "%" })).not.toBeInTheDocument();
    await expect.element(screen.getByText(/Reemplaza la promoción/)).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Aplicar el precio" })).toBeVisible();
  });

  it("names a line sold by weight with its weight", async () => {
    const { screen } = await renderModal({ saleUnit: "KG", quantity: 1250 });

    await expect.element(screen.getByText("YERBA MATE 1 KG · 1,250 kg")).toBeVisible();
  });

  it("sends a typed price in cents with its reason and tells the screen the sale it returns", async () => {
    const { screen, adjust, onAdjusted } = await renderModal();
    await typePrice(screen, "1.500,50");
    await typeReason(screen, "Vence pronto");

    await apply(screen);

    expect(adjust).toHaveBeenCalledExactlyOnceWith(
      "line-1",
      { kind: "PRICE", value: 150_050 },
      "Vence pronto",
      undefined,
    );
    await expect.poll(() => onAdjusted.mock.calls).toEqual([[SALE_OF_YERBA]]);
  });

  it("sends a percentage discount", async () => {
    const { screen, adjust } = await renderModal();
    await chooseKind(screen, "%");
    await typeValue(screen, "Porcentaje de descuento", "10");
    await typeReason(screen, "Cliente frecuente");

    await apply(screen);

    expect(adjust).toHaveBeenCalledExactlyOnceWith(
      "line-1",
      { kind: "PERCENT", value: 10 },
      "Cliente frecuente",
      undefined,
    );
  });

  it("sends a fixed amount discount in cents", async () => {
    const { screen, adjust } = await renderModal();
    await chooseKind(screen, "$");
    await typeValue(screen, "Monto de descuento", "500");
    await typeReason(screen, "Envase dañado");

    await apply(screen);

    expect(adjust).toHaveBeenCalledExactlyOnceWith(
      "line-1",
      { kind: "AMOUNT", value: 50_000 },
      "Envase dañado",
      undefined,
    );
  });

  it("empties the value when the kind of adjustment changes", async () => {
    const { screen } = await renderModal();
    await typePrice(screen, "1.500");

    await chooseKind(screen, "Descuento");

    await expect
      .element(screen.getByRole("textbox", { name: "Porcentaje de descuento" }))
      .toHaveValue("");
  });

  describe("before asking the core", () => {
    it.each([
      ["Precio nuevo", "Precio nuevo", "", "Ingresá un precio válido, por ejemplo 1.500,00."],
      ["$", "Monto de descuento", "0", "Ingresá un descuento mayor a 0, por ejemplo 500,00."],
      ["%", "Porcentaje de descuento", "10,5", "Ingresá un porcentaje entero, por ejemplo 10."],
      ["%", "Porcentaje de descuento", "101", "Ingresá un porcentaje entero, por ejemplo 10."],
    ])("refuses a value that is not valid for %s", async (kind, field, value, message) => {
      const { screen, adjust } = await renderModal();
      await chooseKind(screen, kind);
      await typeValue(screen, field, value);
      await typeReason(screen, "Motivo");

      await apply(screen);

      await expect.element(screen.getByText(message)).toBeVisible();
      expect(adjust).not.toHaveBeenCalled();
    });

    it("asks for the reason", async () => {
      const { screen, adjust } = await renderModal();
      await typePrice(screen, "1.500");
      await typeReason(screen, "   ");

      await apply(screen);

      await expect.element(screen.getByText("Escribí un motivo.")).toBeVisible();
      expect(adjust).not.toHaveBeenCalled();
    });
  });

  it("keeps the button disabled while the core is answering, so it is asked once", async () => {
    const answer = deferred<AdjustSaleLineOutcome>();
    const { screen, adjust } = await renderModal({ adjustSaleLine: () => answer.promise });
    await typePrice(screen, "1.500");
    await typeReason(screen, "Vence pronto");

    await apply(screen);

    await expect.element(screen.getByRole("button", { name: APPLY })).toBeDisabled();
    expect(adjust).toHaveBeenCalledOnce();
  });

  it("closes from Volver without asking the core", async () => {
    const { screen, adjust, onClose } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(adjust).not.toHaveBeenCalled();
  });

  describe("when the sale asks for authorization", () => {
    it("asks someone with permission to authorize it", async () => {
      const { screen, requested } = await renderModal({ authorizationRequired: true });

      await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
      await expect
        .element(screen.getByText("Ada no tiene permiso para cambiar precios o descuentos."))
        .toBeVisible();
      await expect.element(screen.getByRole("button", { name: APPLY })).toBeDisabled();
      expect(requested).toEqual(["override_line_price_or_discount"]);
    });

    it("asks for no authorization when the sale does not require it", async () => {
      const { screen, requested } = await renderModal();

      await expect
        .element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO"))
        .not.toBeInTheDocument();
      expect(requested).toEqual([]);
    });

    it("sends who authorizes and their PIN", async () => {
      const { screen, adjust } = await renderModal({ authorizationRequired: true });
      await typePrice(screen, "1.500");
      await typeReason(screen, "Vence pronto");
      await authorizeAs(screen, "Sofía", "1234");

      await apply(screen);

      expect(adjust).toHaveBeenCalledExactlyOnceWith(
        "line-1",
        { kind: "PRICE", value: 150_000 },
        "Vence pronto",
        { user_id: "u3", pin: "1234" },
      );
    });

    it("shows a refused PIN and stays open", async () => {
      const { screen, onAdjusted } = await renderModal({
        authorizationRequired: true,
        adjustSaleLine: async () => ({
          kind: "wrong_pin",
          retry_after_seconds: 0,
          attempts_left: 6,
        }),
      });
      await typePrice(screen, "1.500");
      await typeReason(screen, "Vence pronto");
      await authorizeAs(screen, "Sofía", "1234");

      await apply(screen);

      await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
      expect(onAdjusted).not.toHaveBeenCalled();
    });

    it("says the chosen person cannot authorize it when the core refuses their permission", async () => {
      const { screen } = await renderModal({
        authorizationRequired: true,
        adjustSaleLine: async () => ({ kind: "lacks_permission" }),
      });
      await typePrice(screen, "1.500");
      await typeReason(screen, "Vence pronto");
      await authorizeAs(screen, "Sofía", "1234");

      await apply(screen);

      await expect
        .element(screen.getByText("Sofía no puede autorizar esto", { exact: true }))
        .toBeVisible();
    });

    it("says who was locked out when the core locks the chosen person", async () => {
      const { screen } = await renderModal({
        authorizationRequired: true,
        adjustSaleLine: async () => ({ kind: "locked", consecutive_failures: 8 }),
      });
      await typePrice(screen, "1.500");
      await typeReason(screen, "Vence pronto");
      await authorizeAs(screen, "Sofía", "1234");

      await apply(screen);

      await expect.element(screen.getByText("Sofía está bloqueado", { exact: true })).toBeVisible();
    });
  });

  describe("when the core refuses", () => {
    it("says the price is the list price, on the price field", async () => {
      const { screen, onAdjusted } = await renderModal({
        adjustSaleLine: async () => ({ kind: "same_as_list_price" }),
      });
      await typePrice(screen, "2.380");
      await typeReason(screen, "Motivo");

      await apply(screen);

      await expect
        .element(screen.getByText("Ese es el precio de lista. Ingresá otro precio."))
        .toBeVisible();
      expect(onAdjusted).not.toHaveBeenCalled();
    });

    it("says the discount is larger than the line, on the amount field", async () => {
      const { screen } = await renderModal({
        adjustSaleLine: async () => ({ kind: "discount_exceeds_line" }),
      });
      await chooseKind(screen, "$");
      await typeValue(screen, "Monto de descuento", "99999");
      await typeReason(screen, "Motivo");

      await apply(screen);

      await expect
        .element(screen.getByText("El descuento no puede ser mayor al total de la línea."))
        .toBeVisible();
    });

    it.each([
      { kind: "unknown_line" },
      { kind: "no_open_sale" },
      { kind: "sale_has_payments" },
    ] as const)("tells the screen the line is gone: $kind", async (outcome) => {
      const { screen, onSaleGone } = await renderModal({ adjustSaleLine: async () => outcome });
      await typePrice(screen, "1.500");
      await typeReason(screen, "Motivo");

      await apply(screen);

      await expect.poll(() => onSaleGone.mock.calls.length).toBe(1);
    });

    it.each([{ kind: "not_signed_in" }, { kind: "no_open_session" }] as const)(
      "tells the screen nobody is signed in: $kind",
      async (outcome) => {
        const { screen, onSessionInvalid } = await renderModal({
          adjustSaleLine: async () => outcome,
        });
        await typePrice(screen, "1.500");
        await typeReason(screen, "Motivo");

        await apply(screen);

        await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
      },
    );

    it("says the person may not sell", async () => {
      const { screen } = await renderModal({
        adjustSaleLine: async () => ({ kind: "not_permitted" }),
      });
      await typePrice(screen, "1.500");
      await typeReason(screen, "Motivo");

      await apply(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No tenés el permiso de vender y cobrar");
    });

    it("says the person no longer may change prices, when nobody was asked to authorize", async () => {
      const { screen } = await renderModal({
        adjustSaleLine: async () => ({ kind: "lacks_permission" }),
      });
      await typePrice(screen, "1.500");
      await typeReason(screen, "Motivo");

      await apply(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("Ya no tenés permiso para cambiar precios o descuentos.");
    });

    it("says the change failed and keeps the button enabled", async () => {
      const { screen } = await renderModal({
        adjustSaleLine: async () => ({ kind: "unavailable" }),
      });
      await typePrice(screen, "1.500");
      await typeReason(screen, "Motivo");

      await apply(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No se pudo aplicar el ajuste. Probá de nuevo.");
      await expect.element(screen.getByRole("button", { name: APPLY })).toBeEnabled();
    });

    it("says the change failed when the core cannot be reached", async () => {
      const { screen } = await renderModal({
        adjustSaleLine: () => Promise.reject(new Error("the connection was replaced")),
      });
      await typePrice(screen, "1.500");
      await typeReason(screen, "Motivo");

      await apply(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No se pudo aplicar el ajuste. Probá de nuevo.");
    });
  });
});

describe("AdjustLineModal previewing the adjustment", () => {
  const TEN_PERCENT: PreviewSaleLineAdjustmentOutcome = {
    kind: "preview",
    discount_amount: 47_600,
    line_total: 428_400,
  };

  it("shows no discount and no remaining total before anything is typed", async () => {
    const { screen, preview } = await renderModal();

    await expect.element(screen.getByText("Queda la línea en")).toBeVisible();
    await expect.element(screen.getByText("—")).toHaveLength(2);
    expect(preview).not.toHaveBeenCalled();
  });

  it("shows exactly the discount and the total the core answers for a typed percentage", async () => {
    const { screen, preview } = await renderModal({ previewAdjustment: async () => TEN_PERCENT });

    await typeValue(screen, "Porcentaje de descuento", "10");

    await expect.element(screen.getByText("− $ 476,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.284,00")).toBeVisible();
    expect(preview).toHaveBeenLastCalledWith("line-1", { kind: "PERCENT", value: 10 });
  });

  it("asks again, in cents, when the amount of the discount is typed", async () => {
    const { screen, preview } = await renderModal({
      previewAdjustment: async () => ({
        kind: "preview",
        discount_amount: 50_000,
        line_total: 426_000,
      }),
    });
    await chooseKind(screen, "$");

    await typeValue(screen, "Monto de descuento", "500");

    await expect.element(screen.getByText("− $ 500,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.260,00")).toBeVisible();
    expect(preview).toHaveBeenLastCalledWith("line-1", { kind: "AMOUNT", value: 50_000 });
  });

  it("shows only what the line is left at when choosing a new price", async () => {
    const { screen, preview } = await renderModal({
      previewAdjustment: async () => ({ kind: "preview", discount_amount: 0, line_total: 600_000 }),
    });

    await typePrice(screen, "3.000");

    await expect.element(screen.getByText("$ 6.000,00")).toBeVisible();
    await expect.element(screen.getByText("Queda la línea en")).toBeVisible();
    await expect.element(screen.getByText("− $", { exact: false })).not.toBeInTheDocument();
    expect(preview).toHaveBeenLastCalledWith("line-1", { kind: "PRICE", value: 300_000 });
  });

  it("shows a placeholder for the total alone when a new price is not typed yet", async () => {
    const { screen } = await renderModal();

    await chooseKind(screen, "Precio nuevo");

    await expect.element(screen.getByText("—")).toHaveLength(1);
  });

  it("does not ask the core while the value is not valid", async () => {
    const { screen, preview } = await renderModal({ previewAdjustment: async () => TEN_PERCENT });

    await typeValue(screen, "Porcentaje de descuento", "10,5");

    await expect.element(screen.getByText("—")).toHaveLength(2);
    expect(preview).not.toHaveBeenCalled();
  });

  it("goes back to the placeholders when the value is cleared", async () => {
    const { screen } = await renderModal({ previewAdjustment: async () => TEN_PERCENT });
    await typeValue(screen, "Porcentaje de descuento", "10");
    await expect.element(screen.getByText("− $ 476,00")).toBeVisible();

    await typeValue(screen, "Porcentaje de descuento", "");

    await expect.element(screen.getByText("− $ 476,00")).not.toBeInTheDocument();
    await expect.element(screen.getByText("—")).toHaveLength(2);
  });

  it("says the price is the list price when the core refuses it", async () => {
    const { screen } = await renderModal({
      previewAdjustment: async () => ({ kind: "same_as_list_price" }),
    });

    await typePrice(screen, "2.380");

    await expect
      .element(screen.getByText("Ese es el precio de lista. Ingresá otro precio."))
      .toBeVisible();
    await expect.element(screen.getByText("—")).toHaveLength(1);
  });

  it("says the discount is above the line's total when the core refuses it", async () => {
    const { screen } = await renderModal({
      previewAdjustment: async () => ({ kind: "discount_exceeds_line" }),
    });
    await chooseKind(screen, "$");

    await typeValue(screen, "Monto de descuento", "9.999");

    await expect
      .element(screen.getByText("El descuento no puede ser mayor al total de la línea."))
      .toBeVisible();
    await expect.element(screen.getByText("—")).toHaveLength(2);
  });

  it.each<PreviewSaleLineAdjustmentOutcome>([
    { kind: "unknown_line" },
    { kind: "no_open_sale" },
    { kind: "no_open_session" },
    { kind: "sale_has_payments" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "unavailable" },
  ])("keeps the placeholders when the core answers $kind", async (outcome) => {
    const { screen, preview } = await renderModal({ previewAdjustment: async () => outcome });

    await typeValue(screen, "Porcentaje de descuento", "10");

    await expect.poll(() => preview.mock.calls.length).toBe(1);
    await expect.element(screen.getByText("—")).toHaveLength(2);
  });

  it("keeps the placeholders when the core cannot be reached", async () => {
    const { screen, preview } = await renderModal({
      previewAdjustment: () => Promise.reject(new Error("the connection was replaced")),
    });

    await typeValue(screen, "Porcentaje de descuento", "10");

    await expect.poll(() => preview.mock.calls.length).toBe(1);
    await expect.element(screen.getByText("—")).toHaveLength(2);
  });

  it("passes the accessibility checks with the core's answer shown", async () => {
    const { screen } = await renderModal({ previewAdjustment: async () => TEN_PERCENT });
    await typeValue(screen, "Porcentaje de descuento", "10");
    await expect.element(screen.getByText("− $ 476,00")).toBeVisible();

    await expectNoAccessibilityViolations(document.body);
  });
});
