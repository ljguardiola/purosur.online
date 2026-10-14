import type {
  ApplySaleDiscountOutcome,
  Authorization,
  OpenSale,
  PreviewSaleDiscountOutcome,
  SaleDiscountRequest,
  SignInUser,
} from "@purosur/contracts";
import { InlineNotice, SummaryRow, TextField } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { TriangleAlert } from "lucide-react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render as renderReference } from "vitest-browser-react";
import type { SignedInPerson } from "../shell/signed-in-person";
import { expectDrawnLike } from "../shell/test-support/drawn-like";
import { render } from "../shell/test-support/render-with-router";
import { ApplySaleDiscountModal } from "./apply-sale-discount-modal";
import { deferred, SALE_OF_YERBA } from "./test-support/sale-screen";

const PERSON: SignedInPerson = { user_id: "u1", first_name: "Ada", abilities: [] };
const AUTHORIZERS: SignInUser[] = [
  { id: "u3", first_name: "Sofía" },
  { id: "u2", first_name: "Grace" },
];
const APPLY = "Aplicar el descuento";
const REASON = "Motivo";
const APPLIED: ApplySaleDiscountOutcome = { kind: "applied", sale: SALE_OF_YERBA };
const FIVE_PERCENT: PreviewSaleDiscountOutcome = {
  kind: "preview",
  subtotal: 5_070_000,
  discount_amount: 253_500,
  total: 4_816_500,
};

type Props = {
  lineCount?: number;
  authorizationRequired?: boolean;
  applySaleDiscount?: (
    discount: SaleDiscountRequest,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ApplySaleDiscountOutcome>;
  previewSaleDiscount?: (discount: SaleDiscountRequest) => Promise<PreviewSaleDiscountOutcome>;
};

async function renderModal({
  lineCount = 8,
  authorizationRequired = false,
  applySaleDiscount = async () => APPLIED,
  previewSaleDiscount = async () => ({ kind: "no_open_sale" }),
}: Props = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const apply = vi.fn(applySaleDiscount);
  const preview = vi.fn(previewSaleDiscount);
  const requested: string[] = [];
  const loadAuthorizers = async (permission: string) => {
    requested.push(permission);
    return AUTHORIZERS;
  };
  const handlers = {
    onApplied: vi.fn<(sale: OpenSale) => void>(),
    onSaleGone: vi.fn(),
    onSessionInvalid: vi.fn(),
    onClose: vi.fn(),
  };
  const screen = await render(
    <ApplySaleDiscountModal
      lineCount={lineCount}
      subtotal={5_070_000}
      authorizationRequired={authorizationRequired}
      person={PERSON}
      loadAuthorizers={loadAuthorizers}
      applySaleDiscount={apply}
      previewSaleDiscount={preview}
      {...handlers}
    />,
  );
  return { screen, apply, preview, requested, ...handlers };
}

type Screen = Awaited<ReturnType<typeof renderModal>>["screen"];

async function typeReason(screen: Screen, reason: string) {
  await userEvent.fill(screen.getByRole("textbox", { name: REASON }), reason);
}

async function typeValue(screen: Screen, label: string, value: string) {
  await userEvent.fill(screen.getByRole("textbox", { name: label }), value);
}

async function chooseKind(screen: Screen, name: string) {
  const label = screen.getByRole("radio", { name }).element().closest("label");
  if (label === null) {
    throw new Error(`no label found for the option ${name}`);
  }
  await userEvent.click(label);
}

async function authorizeAs(screen: Screen, firstName: string, pin: string) {
  await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));
  await userEvent.click(screen.getByRole("option", { name: firstName }));
  await userEvent.type(screen.getByLabelText("PIN"), pin);
}

async function submit(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: APPLY }));
}

async function fillValidPercentage(screen: Screen) {
  await typeValue(screen, "Porcentaje de descuento", "5");
  await typeReason(screen, "Cliente frecuente");
}

describe("ApplySaleDiscountModal", () => {
  it("names the sale it discounts by its number of lines and warns the discount goes away when a line changes", async () => {
    const { screen } = await renderModal();

    await expect
      .element(screen.getByRole("heading", { name: "Descuento sobre el total" }))
      .toBeVisible();
    await expect.element(screen.getByText("VENTA EN CURSO · 8 LÍNEAS")).toBeVisible();
    await expect
      .element(
        screen
          .getByText(
            "Si después cambiás una línea, este descuento se quita y hay que volver a aplicarlo.",
          )
          .first(),
      )
      .toBeVisible();
    await expectNoAccessibilityViolations(document.body);
  });

  it("names a sale of one line in the singular", async () => {
    const { screen } = await renderModal({ lineCount: 1 });

    await expect.element(screen.getByText("VENTA EN CURSO · 1 LÍNEA")).toBeVisible();
  });

  it("starts on a percentage, saying the discount adds to promotions and line discounts", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByRole("radio", { name: "%" })).toBeChecked();
    await expect
      .element(screen.getByRole("textbox", { name: "Porcentaje de descuento" }))
      .toBeVisible();
    await expect
      .element(screen.getByText("Se suma a las promociones y a los descuentos de línea."))
      .toBeVisible();
    await expect
      .element(screen.getByRole("textbox", { name: "Porcentaje de descuento" }))
      .toHaveAttribute("inputmode", "numeric");
  });

  it("heads the modal with the percent icon", async () => {
    await renderModal();

    expect(document.querySelector("svg.lucide-percent")).not.toBeNull();
    expect(document.querySelector("svg.lucide-badge-percent")).toBeNull();
  });

  it("draws the value in the discount entry, with no unit inside it, for a percentage and for an amount", async () => {
    const { screen } = await renderModal();
    const reference = await renderReference(
      <TextField kind="discount" label="Referencia" value="" onChange={() => {}} />,
    );
    const referenceInput = reference.getByRole("textbox", { name: "Referencia" }).element();
    const referenceBox = referenceInput.parentElement as HTMLElement;

    for (const [unit, name] of [
      ["%", "Porcentaje de descuento"],
      ["$", "Monto de descuento"],
    ] as const) {
      await chooseKind(screen, unit);
      const input = screen.getByRole("textbox", { name }).element() as HTMLElement;
      const box = input.parentElement as HTMLElement;

      expectDrawnLike(box, referenceBox, ["width", "height"], `${unit} box`);
      expectDrawnLike(input, referenceInput, ["fontSize", "textAlign"], `${unit} value`);
      expect(box.children).toHaveLength(1);
    }
  });

  it("puts the unit to the left of the value, on one row", async () => {
    const { screen } = await renderModal();
    const units = screen.getByRole("radiogroup", { name: "Unidad del descuento" }).element();
    const box = screen.getByRole("textbox", { name: "Porcentaje de descuento" }).element()
      .parentElement as HTMLElement;
    const unitsRect = units.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();

    expect(unitsRect.right).toBeLessThanOrEqual(boxRect.left);
    const boxMiddle = boxRect.top + boxRect.height / 2;
    expect(unitsRect.top).toBeLessThan(boxMiddle);
    expect(unitsRect.bottom).toBeGreaterThan(boxMiddle);
  });

  it("shows the warning about changing a line as a warning notice", async () => {
    const { screen } = await renderModal();
    const reference = await renderReference(
      <InlineNotice tone="warning" icon={<TriangleAlert />} title="Referencia" />,
    );

    const shown = screen
      .getByText(
        "Si después cambiás una línea, este descuento se quita y hay que volver a aplicarlo.",
      )
      .first()
      .element();
    const referenceTitle = reference.getByText("Referencia").first().element();
    expectDrawnLike(shown, referenceTitle, ["color", "fontSize", "fontWeight"], "warning");
    expect(getComputedStyle(shown.parentElement?.parentElement as Element).backgroundColor).toBe(
      getComputedStyle(referenceTitle.parentElement?.parentElement as Element).backgroundColor,
    );
    await reference.unmount();
  });

  it("asks for an amount when the dollar sign is chosen, emptying what was typed", async () => {
    const { screen } = await renderModal();
    await typeValue(screen, "Porcentaje de descuento", "5");

    await chooseKind(screen, "$");

    await expect
      .element(screen.getByRole("textbox", { name: "Monto de descuento" }))
      .toHaveValue("");
    await expect
      .element(screen.getByRole("textbox", { name: "Monto de descuento" }))
      .toHaveAttribute("inputmode", "decimal");
  });

  it("sends a percentage with its reason and tells the screen the sale it returns", async () => {
    const { screen, apply, onApplied } = await renderModal();
    await fillValidPercentage(screen);

    await submit(screen);

    expect(apply).toHaveBeenCalledExactlyOnceWith(
      { kind: "PERCENT", value: 5 },
      "Cliente frecuente",
      undefined,
    );
    await expect.poll(() => onApplied.mock.calls).toEqual([[SALE_OF_YERBA]]);
  });

  it("sends a fixed amount in cents", async () => {
    const { screen, apply } = await renderModal();
    await chooseKind(screen, "$");
    await typeValue(screen, "Monto de descuento", "2.700,50");
    await typeReason(screen, "Compra grande");

    await submit(screen);

    expect(apply).toHaveBeenCalledExactlyOnceWith(
      { kind: "AMOUNT", value: 270_050 },
      "Compra grande",
      undefined,
    );
  });

  describe("before asking the core", () => {
    it.each([
      ["$", "Monto de descuento", "0", "Ingresá un descuento mayor a 0, por ejemplo 500,00."],
      ["%", "Porcentaje de descuento", "5,5", "Ingresá un porcentaje entero, por ejemplo 10."],
      ["%", "Porcentaje de descuento", "101", "Ingresá un porcentaje entero, por ejemplo 10."],
    ])("refuses a value that is not valid for %s", async (kind, field, value, message) => {
      const { screen, apply } = await renderModal();
      await chooseKind(screen, kind);
      await typeValue(screen, field, value);
      await typeReason(screen, "Motivo");

      await submit(screen);

      await expect.element(screen.getByText(message)).toBeVisible();
      expect(apply).not.toHaveBeenCalled();
    });

    it("asks for the reason", async () => {
      const { screen, apply } = await renderModal();
      await typeValue(screen, "Porcentaje de descuento", "5");
      await typeReason(screen, "   ");

      await submit(screen);

      await expect.element(screen.getByText("Escribí un motivo.")).toBeVisible();
      expect(apply).not.toHaveBeenCalled();
    });
  });

  it("keeps the button disabled while the core is answering, so it is asked once", async () => {
    const answer = deferred<ApplySaleDiscountOutcome>();
    const { screen, apply } = await renderModal({ applySaleDiscount: () => answer.promise });
    await fillValidPercentage(screen);

    await submit(screen);

    await expect.element(screen.getByRole("button", { name: APPLY })).toBeDisabled();
    expect(apply).toHaveBeenCalledOnce();
  });

  it("closes from Volver without asking the core", async () => {
    const { screen, apply, onClose } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
  });

  describe("when the sale asks for authorization", () => {
    it("asks someone with permission to authorize it", async () => {
      const { screen, requested } = await renderModal({ authorizationRequired: true });

      await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
      await expect
        .element(screen.getByText("Ada no tiene permiso para descontar sobre el total."))
        .toBeVisible();
      await expect.element(screen.getByRole("button", { name: APPLY })).toBeDisabled();
      expect(requested).toEqual(["apply_total_discount"]);
    });

    it("asks for no authorization when the sale does not require it", async () => {
      const { screen, requested } = await renderModal();

      await expect
        .element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO"))
        .not.toBeInTheDocument();
      expect(requested).toEqual([]);
    });

    it("sends who authorizes and their PIN", async () => {
      const { screen, apply } = await renderModal({ authorizationRequired: true });
      await fillValidPercentage(screen);
      await authorizeAs(screen, "Sofía", "1234");

      await submit(screen);

      expect(apply).toHaveBeenCalledExactlyOnceWith(
        { kind: "PERCENT", value: 5 },
        "Cliente frecuente",
        { user_id: "u3", pin: "1234" },
      );
    });

    it("shows a refused PIN and stays open", async () => {
      const { screen, onApplied } = await renderModal({
        authorizationRequired: true,
        applySaleDiscount: async () => ({
          kind: "wrong_pin",
          retry_after_seconds: 0,
          attempts_left: 6,
        }),
      });
      await fillValidPercentage(screen);
      await authorizeAs(screen, "Sofía", "1234");

      await submit(screen);

      await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
      expect(onApplied).not.toHaveBeenCalled();
    });

    it("says the chosen person cannot authorize it when the core refuses their permission", async () => {
      const { screen } = await renderModal({
        authorizationRequired: true,
        applySaleDiscount: async () => ({ kind: "lacks_permission" }),
      });
      await fillValidPercentage(screen);
      await authorizeAs(screen, "Sofía", "1234");

      await submit(screen);

      await expect
        .element(screen.getByText("Sofía no puede autorizar esto", { exact: true }))
        .toBeVisible();
    });
  });

  describe("when the core refuses", () => {
    it("says the discount is larger than the sale, on the value field", async () => {
      const { screen, onApplied } = await renderModal({
        applySaleDiscount: async () => ({ kind: "discount_exceeds_sale" }),
      });
      await chooseKind(screen, "$");
      await typeValue(screen, "Monto de descuento", "99.999");
      await typeReason(screen, "Motivo");

      await submit(screen);

      await expect
        .element(screen.getByText("El descuento no puede ser mayor al total de la venta."))
        .toBeVisible();
      expect(onApplied).not.toHaveBeenCalled();
    });

    it("says the sale has no lines", async () => {
      const { screen } = await renderModal({
        applySaleDiscount: async () => ({ kind: "empty_sale" }),
      });
      await fillValidPercentage(screen);

      await submit(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("La venta no tiene líneas para descontar.");
    });

    it("says the sale already totals zero", async () => {
      const { screen } = await renderModal({
        applySaleDiscount: async () => ({ kind: "zero_total" }),
      });
      await fillValidPercentage(screen);

      await submit(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("El total de la venta ya es $ 0,00: no hay nada para descontar.");
    });

    it.each([{ kind: "no_open_sale" }, { kind: "sale_has_payments" }] as const)(
      "tells the screen the sale is gone: $kind",
      async (outcome) => {
        const { screen, onSaleGone } = await renderModal({
          applySaleDiscount: async () => outcome,
        });
        await fillValidPercentage(screen);

        await submit(screen);

        await expect.poll(() => onSaleGone.mock.calls.length).toBe(1);
      },
    );

    it.each([{ kind: "not_signed_in" }, { kind: "no_open_session" }] as const)(
      "tells the screen nobody is signed in: $kind",
      async (outcome) => {
        const { screen, onSessionInvalid } = await renderModal({
          applySaleDiscount: async () => outcome,
        });
        await fillValidPercentage(screen);

        await submit(screen);

        await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
      },
    );

    it("says the person may not sell", async () => {
      const { screen } = await renderModal({
        applySaleDiscount: async () => ({ kind: "not_permitted" }),
      });
      await fillValidPercentage(screen);

      await submit(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No tenés el permiso de vender y cobrar");
    });

    it("says the person no longer may discount the total, when nobody was asked to authorize", async () => {
      const { screen } = await renderModal({
        applySaleDiscount: async () => ({ kind: "lacks_permission" }),
      });
      await fillValidPercentage(screen);

      await submit(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("Ya no tenés permiso para descontar sobre el total.");
    });

    it("says the discount failed and keeps the button enabled when the core cannot be reached", async () => {
      const { screen } = await renderModal({
        applySaleDiscount: () => Promise.reject(new Error("the connection was replaced")),
      });
      await fillValidPercentage(screen);

      await submit(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No se pudo aplicar el descuento. Probá de nuevo.");
      await expect.element(screen.getByRole("button", { name: APPLY })).toBeEnabled();
    });
  });
});

describe("ApplySaleDiscountModal previewing the discount", () => {
  it("shows a placeholder in each row before anything is typed, asking the core nothing", async () => {
    const { screen, preview } = await renderModal();

    await expect.element(screen.getByText("Después de promociones")).toBeVisible();
    await expect.element(screen.getByText("Total a cobrar")).toBeVisible();
    await expect.element(screen.getByText("—")).toHaveLength(3);
    expect(preview).not.toHaveBeenCalled();
  });

  it("shows exactly the subtotal, the discount and the total the core answers", async () => {
    const { screen, preview } = await renderModal({
      previewSaleDiscount: async () => FIVE_PERCENT,
    });

    await typeValue(screen, "Porcentaje de descuento", "5");

    await expect.element(screen.getByText("$ 50.700,00")).toBeVisible();
    await expect.element(screen.getByText("− $ 2.535,00")).toBeVisible();
    await expect.element(screen.getByText("$ 48.165,00")).toBeVisible();
    expect(preview).toHaveBeenLastCalledWith({ kind: "PERCENT", value: 5 });
  });

  it("asks again, in cents, when an amount is typed", async () => {
    const { screen, preview } = await renderModal({
      previewSaleDiscount: async () => ({
        kind: "preview",
        subtotal: 5_070_000,
        discount_amount: 270_000,
        total: 4_800_000,
      }),
    });
    await chooseKind(screen, "$");

    await typeValue(screen, "Monto de descuento", "2.700");

    await expect.element(screen.getByText("− $ 2.700,00")).toBeVisible();
    await expect.element(screen.getByText("$ 48.000,00")).toBeVisible();
    expect(preview).toHaveBeenLastCalledWith({ kind: "AMOUNT", value: 270_000 });
  });

  it("draws the rows as detail rows, the discount in the error tone and the total in the info tone", async () => {
    const { screen } = await renderModal({ previewSaleDiscount: async () => FIVE_PERCENT });
    const reference = await renderReference(
      <>
        <SummaryRow label="Referencia de subtotal" value="$ 1,00" detail />
        <SummaryRow label="Referencia de descuento" value="− $ 2,00" detail tone="error" />
        <SummaryRow label="Referencia de total" value="$ 3,00" detail tone="info" />
      </>,
    );

    await typeValue(screen, "Porcentaje de descuento", "5");

    await expect.element(screen.getByText("− $ 2.535,00")).toBeVisible();
    for (const [shown, drawnAs, context] of [
      ["$ 50.700,00", "$ 1,00", "subtotal"],
      ["− $ 2.535,00", "− $ 2,00", "discount"],
      ["$ 48.165,00", "$ 3,00", "total"],
    ] as const) {
      const value = screen.getByText(shown, { exact: true }).element();
      const referenceValue = reference.getByText(drawnAs, { exact: true }).element();
      expectDrawnLike(value, referenceValue, ["color", "fontSize", "fontWeight"], context);
    }
    await reference.unmount();
  });

  it("does not ask the core while the value is not valid", async () => {
    const { screen, preview } = await renderModal({
      previewSaleDiscount: async () => FIVE_PERCENT,
    });

    await typeValue(screen, "Porcentaje de descuento", "5,5");

    await expect.element(screen.getByText("—")).toHaveLength(3);
    expect(preview).not.toHaveBeenCalled();
  });

  it("goes back to the placeholders when the value is cleared", async () => {
    const { screen } = await renderModal({ previewSaleDiscount: async () => FIVE_PERCENT });
    await typeValue(screen, "Porcentaje de descuento", "5");
    await expect.element(screen.getByText("− $ 2.535,00")).toBeVisible();

    await typeValue(screen, "Porcentaje de descuento", "");

    await expect.element(screen.getByText("− $ 2.535,00")).not.toBeInTheDocument();
    await expect.element(screen.getByText("—")).toHaveLength(3);
  });

  it("says the discount is above the sale's total when the core refuses it", async () => {
    const { screen } = await renderModal({
      previewSaleDiscount: async () => ({ kind: "discount_exceeds_sale" }),
    });
    await chooseKind(screen, "$");

    await typeValue(screen, "Monto de descuento", "99.999");

    await expect
      .element(screen.getByText("El descuento no puede ser mayor al total de la venta."))
      .toBeVisible();
    await expect.element(screen.getByText("—")).toHaveLength(3);
  });

  it.each<PreviewSaleDiscountOutcome>([
    { kind: "empty_sale" },
    { kind: "zero_total" },
    { kind: "no_open_sale" },
    { kind: "no_open_session" },
    { kind: "sale_has_payments" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
  ])("keeps the placeholders when the core answers $kind", async (outcome) => {
    const { screen, preview } = await renderModal({ previewSaleDiscount: async () => outcome });

    await typeValue(screen, "Porcentaje de descuento", "5");

    await expect.poll(() => preview.mock.calls.length).toBe(1);
    await expect.element(screen.getByText("—")).toHaveLength(3);
  });

  it("shows the preview loading until the core answers", async () => {
    const answer = deferred<PreviewSaleDiscountOutcome>();
    const { screen } = await renderModal({ previewSaleDiscount: () => answer.promise });

    await typeValue(screen, "Porcentaje de descuento", "5");

    await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
    await expect.element(screen.getByText("—")).not.toBeInTheDocument();
    answer.resolve(FIVE_PERCENT);
    await expect.element(screen.getByText("$ 48.165,00")).toBeVisible();
    await expect.element(screen.getByText("Cargando…")).not.toBeInTheDocument();
  });

  it.each<[string, () => Promise<PreviewSaleDiscountOutcome>]>([
    ["cannot be reached", () => Promise.reject(new Error("the connection was replaced"))],
    ["answers it is unavailable", async () => ({ kind: "unavailable" })],
  ])("says the preview could not be calculated when the core %s", async (_what, failing) => {
    const { screen } = await renderModal({ previewSaleDiscount: failing });

    await typeValue(screen, "Porcentaje de descuento", "5");

    await expect.element(screen.getByText("No se pudo calcular cómo queda la venta")).toBeVisible();
    await expect.element(screen.getByText("—")).not.toBeInTheDocument();
  });

  it("passes the accessibility checks with the core's answer shown", async () => {
    const { screen } = await renderModal({ previewSaleDiscount: async () => FIVE_PERCENT });
    await typeValue(screen, "Porcentaje de descuento", "5");
    await expect.element(screen.getByText("− $ 2.535,00")).toBeVisible();

    await expectNoAccessibilityViolations(document.body);
  });
});
