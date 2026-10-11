import type {
  AdjustSaleLineOutcome,
  Authorization,
  ManualAdjustmentRequest,
  OpenSale,
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
const APPLY = "Aplicar ajuste";
const REASON = "Motivo del ajuste";
const CHANGED: AdjustSaleLineOutcome = {
  kind: "changed",
  sale: SALE_OF_YERBA,
  authorized_by: null,
};

type Props = {
  authorizationRequired?: boolean;
  saleUnit?: "UNIT" | "KG";
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
  adjustSaleLine = async () => CHANGED,
}: Props = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const adjust = vi.fn(adjustSaleLine);
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
      saleUnit={saleUnit}
      authorizationRequired={authorizationRequired}
      person={PERSON}
      loadAuthorizers={loadAuthorizers}
      adjustSaleLine={adjust}
      {...handlers}
    />,
  );
  return { screen, adjust, requested, ...handlers };
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

async function apply(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: APPLY }));
}

describe("AdjustLineModal", () => {
  it("names the product and shows its list price", async () => {
    const { screen } = await renderModal();

    await expect
      .element(screen.getByRole("heading", { name: "Precio o descuento de Yerba mate 1 kg" }))
      .toBeVisible();
    await expect.element(screen.getByText("$ 2.380,00")).toBeVisible();
    await expectNoAccessibilityViolations(document.body);
  });

  it("starts on a new price per unit", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByRole("radio", { name: "Precio nuevo" })).toBeChecked();
    await expect.element(screen.getByRole("textbox", { name: "Precio nuevo por unidad" })).toBeVisible();
  });

  it("asks the price per kg for a product sold by weight", async () => {
    const { screen } = await renderModal({ saleUnit: "KG" });

    await expect.element(screen.getByRole("textbox", { name: "Precio nuevo por kg" })).toBeVisible();
  });

  it("sends a typed price in cents with its reason and tells the screen the sale it returns", async () => {
    const { screen, adjust, onAdjusted } = await renderModal();
    await typeValue(screen, "Precio nuevo por unidad", "1.500,50");
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
    await userEvent.click(screen.getByRole("radio", { name: "Descuento en %" }));
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
    await userEvent.click(screen.getByRole("radio", { name: "Descuento en $" }));
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
    await typeValue(screen, "Precio nuevo por unidad", "1.500");

    await userEvent.click(screen.getByRole("radio", { name: "Descuento en %" }));

    await expect.element(screen.getByRole("textbox", { name: "Porcentaje de descuento" })).toHaveValue("");
  });

  describe("before asking the core", () => {
    it.each([
      ["Precio nuevo", "Precio nuevo por unidad", "", "Ingresá un precio válido, por ejemplo 1.500,00."],
      [
        "Descuento en $",
        "Monto de descuento",
        "0",
        "Ingresá un descuento mayor a 0, por ejemplo 500,00.",
      ],
      [
        "Descuento en %",
        "Porcentaje de descuento",
        "10,5",
        "Ingresá un porcentaje entero, por ejemplo 10.",
      ],
      [
        "Descuento en %",
        "Porcentaje de descuento",
        "101",
        "Ingresá un porcentaje entero, por ejemplo 10.",
      ],
    ])("refuses a value that is not valid for %s", async (kind, field, value, message) => {
      const { screen, adjust } = await renderModal();
      await userEvent.click(screen.getByRole("radio", { name: kind }));
      await typeValue(screen, field, value);
      await typeReason(screen, "Motivo");

      await apply(screen);

      await expect.element(screen.getByText(message)).toBeVisible();
      expect(adjust).not.toHaveBeenCalled();
    });

    it("asks for the reason", async () => {
      const { screen, adjust } = await renderModal();
      await typeValue(screen, "Precio nuevo por unidad", "1.500");
      await typeReason(screen, "   ");

      await apply(screen);

      await expect.element(screen.getByText("Escribí el motivo del ajuste.")).toBeVisible();
      expect(adjust).not.toHaveBeenCalled();
    });
  });

  it("keeps the button disabled while the core is answering, so it is asked once", async () => {
    const answer = deferred<AdjustSaleLineOutcome>();
    const { screen, adjust } = await renderModal({ adjustSaleLine: () => answer.promise });
    await typeValue(screen, "Precio nuevo por unidad", "1.500");
    await typeReason(screen, "Vence pronto");

    await apply(screen);

    await expect.element(screen.getByRole("button", { name: APPLY })).toBeDisabled();
    expect(adjust).toHaveBeenCalledOnce();
  });

  it("closes from Cancelar without asking the core", async () => {
    const { screen, adjust, onClose } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

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

      await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).not.toBeInTheDocument();
      expect(requested).toEqual([]);
    });

    it("sends who authorizes and their PIN", async () => {
      const { screen, adjust } = await renderModal({ authorizationRequired: true });
      await typeValue(screen, "Precio nuevo por unidad", "1.500");
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
        adjustSaleLine: async () => ({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 6 }),
      });
      await typeValue(screen, "Precio nuevo por unidad", "1.500");
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
      await typeValue(screen, "Precio nuevo por unidad", "1.500");
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
      await typeValue(screen, "Precio nuevo por unidad", "1.500");
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
      await typeValue(screen, "Precio nuevo por unidad", "2.380");
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
      await userEvent.click(screen.getByRole("radio", { name: "Descuento en $" }));
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
      await typeValue(screen, "Precio nuevo por unidad", "1.500");
      await typeReason(screen, "Motivo");

      await apply(screen);

      await expect.poll(() => onSaleGone.mock.calls.length).toBe(1);
    });

    it.each([
      { kind: "not_signed_in" },
      { kind: "no_open_session" },
    ] as const)("tells the screen nobody is signed in: $kind", async (outcome) => {
      const { screen, onSessionInvalid } = await renderModal({
        adjustSaleLine: async () => outcome,
      });
      await typeValue(screen, "Precio nuevo por unidad", "1.500");
      await typeReason(screen, "Motivo");

      await apply(screen);

      await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
    });

    it("says the person may not sell", async () => {
      const { screen } = await renderModal({ adjustSaleLine: async () => ({ kind: "not_permitted" }) });
      await typeValue(screen, "Precio nuevo por unidad", "1.500");
      await typeReason(screen, "Motivo");

      await apply(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No tenés el permiso de vender y cobrar");
    });

    it("says the person no longer may change prices, when nobody was asked to authorize", async () => {
      const { screen } = await renderModal({ adjustSaleLine: async () => ({ kind: "lacks_permission" }) });
      await typeValue(screen, "Precio nuevo por unidad", "1.500");
      await typeReason(screen, "Motivo");

      await apply(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("Ya no tenés permiso para cambiar precios o descuentos.");
    });

    it("says the change failed and keeps the button enabled", async () => {
      const { screen } = await renderModal({ adjustSaleLine: async () => ({ kind: "unavailable" }) });
      await typeValue(screen, "Precio nuevo por unidad", "1.500");
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
      await typeValue(screen, "Precio nuevo por unidad", "1.500");
      await typeReason(screen, "Motivo");

      await apply(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No se pudo aplicar el ajuste. Probá de nuevo.");
    });
  });
});
