import type { OpenSale } from "@purosur/contracts";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { SaleLineActions } from "./sale-lines";
import { SaleLines } from "./sale-lines";

const YERBA: OpenSale["lines"][number] = {
  id: "line-1",
  product_id: "p1",
  product_name: "Yerba mate 1 kg",
  sale_unit: "UNIT" as const,
  weight_source: null,
  quantity: 2,
  list_unit_price: 238_000,
  discount_amount: 0,
  promotion: null,
  manual_adjustment: null,
  line_total: 476_000,
};
const LOCKED_REASON = "La venta ya no se puede cambiar porque tiene un pago aprobado.";
const CONTROLS = [
  "Bajar la cantidad de Yerba mate 1 kg",
  "Subir la cantidad de Yerba mate 1 kg",
  "Cambiar el precio de Yerba mate 1 kg",
  "Quitar Yerba mate 1 kg",
];

const QUESO: OpenSale["lines"][number] = {
  id: "line-3",
  product_id: "p3",
  product_name: "Queso cremoso",
  sale_unit: "KG",
  weight_source: "MANUAL",
  quantity: 1250,
  list_unit_price: 1_250_000,
  discount_amount: 0,
  promotion: null,
  manual_adjustment: null,
  line_total: 1_562_500,
};

async function renderLines(
  actions: Partial<SaleLineActions> = {},
  lines: OpenSale["lines"] = [YERBA],
) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  const onChangeQuantity = vi.fn();
  const onChangeWeight = vi.fn();
  const onAdjust = vi.fn();
  const onRemove = vi.fn();
  const screen = await render(
    <SaleLines
      lines={lines}
      changedLineId={undefined}
      actions={{
        busy: false,
        editable: true,
        lockedReason: undefined,
        onChangeQuantity,
        onChangeWeight,
        onAdjust,
        onRemove,
        ...actions,
      }}
    />,
  );
  return { screen, onChangeQuantity, onChangeWeight, onAdjust, onRemove };
}

describe("SaleLines", () => {
  it("raises, lowers and removes a line while the sale can be changed", async () => {
    const { screen, onChangeQuantity, onRemove } = await renderLines();

    await screen.getByRole("button", { name: "Subir la cantidad de Yerba mate 1 kg" }).click();
    await screen.getByRole("button", { name: "Bajar la cantidad de Yerba mate 1 kg" }).click();
    await screen.getByRole("button", { name: "Quitar Yerba mate 1 kg" }).click();

    expect(onChangeQuantity.mock.calls).toEqual([
      [YERBA, 3],
      [YERBA, 1],
    ]);
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(YERBA);
  });

  it("asks to change the price of the line", async () => {
    const { screen, onAdjust } = await renderLines();

    await screen.getByRole("button", { name: "Cambiar el precio de Yerba mate 1 kg" }).click();

    expect(onAdjust).toHaveBeenCalledExactlyOnceWith(YERBA);
  });

  describe("a line with a manual adjustment", () => {
    it("shows the percentage discount in place of a promotion, with the price before it struck out", async () => {
      const discounted: OpenSale["lines"][number] = {
        ...YERBA,
        discount_amount: 47_600,
        manual_adjustment: {
          kind: "PERCENT",
          value: 10,
          reason: "Envase dañado",
          authorized_by: null,
        },
        line_total: 428_400,
      };
      const { screen } = await renderLines({}, [discounted]);

      await expect.element(screen.getByText("Descuento manual 10 %")).toBeVisible();
      const before = screen.getByText("$ 4.760,00");
      expect(before.element().tagName).toBe("S");
      await expect.element(screen.getByText("$ 4.284,00")).toBeVisible();
    });

    it("shows a fixed amount discount as money", async () => {
      const discounted: OpenSale["lines"][number] = {
        ...YERBA,
        discount_amount: 50_000,
        manual_adjustment: {
          kind: "AMOUNT",
          value: 50_000,
          reason: "Envase dañado",
          authorized_by: null,
        },
        line_total: 426_000,
      };
      const { screen } = await renderLines({}, [discounted]);

      await expect.element(screen.getByText("Descuento manual $ 500,00")).toBeVisible();
    });

    it("shows a new price as modified, with nothing struck out", async () => {
      const repriced: OpenSale["lines"][number] = {
        ...YERBA,
        manual_adjustment: {
          kind: "PRICE",
          value: 200_000,
          reason: "Vence pronto",
          authorized_by: { user_id: "u3", first_name: "Sofía" },
        },
        line_total: 400_000,
      };
      const { screen } = await renderLines({}, [repriced]);

      await expect.element(screen.getByText("Precio modificado: $ 2.000,00")).toBeVisible();
      await expect.element(screen.getByText("$ 4.000,00")).toBeVisible();
      expect(document.querySelector("s")).toBeNull();
    });
  });

  it("locks every control of a line while a change is answering", async () => {
    const { screen } = await renderLines({ busy: true });

    for (const name of CONTROLS) {
      await expect.element(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  it("locks every control of a line, saying why in a tooltip, when the sale can no longer be changed", async () => {
    const { screen, onChangeQuantity, onRemove } = await renderLines({
      editable: false,
      lockedReason: LOCKED_REASON,
    });

    for (const name of CONTROLS) {
      const control = screen.getByRole("button", { name });
      await expect.element(control).toHaveAttribute("aria-disabled", "true");
      control.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    window.focus();
    await userEvent.tab();

    await expect.element(screen.getByRole("tooltip")).toHaveTextContent(LOCKED_REASON);
    expect(onChangeQuantity).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("locks every control of a line with no tooltip when the sale can no longer be changed but no reason is given", async () => {
    const { screen } = await renderLines({ editable: false });

    for (const name of CONTROLS) {
      await expect.element(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  describe("a line sold by the kilogram", () => {
    it("shows its weight and its price per kilogram, with no quantity steppers and nothing about where the weight came from", async () => {
      const { screen } = await renderLines({}, [QUESO]);

      await expect.element(screen.getByText("1,250 kg")).toBeVisible();
      await expect.element(screen.getByText("$ 12.500,00 el kg")).toBeVisible();
      await expect.element(screen.getByText("Peso tipeado")).not.toBeInTheDocument();
      await expect.element(screen.getByText("$ 15.625,00")).toBeVisible();
      await expect
        .element(screen.getByRole("button", { name: "Subir la cantidad de Queso cremoso" }))
        .not.toBeInTheDocument();
      await expect
        .element(screen.getByRole("button", { name: "Bajar la cantidad de Queso cremoso" }))
        .not.toBeInTheDocument();
    });

    it("asks to change the weight of the line", async () => {
      const { screen, onChangeWeight } = await renderLines({}, [QUESO]);

      await screen.getByRole("button", { name: "Cambiar el peso de Queso cremoso" }).click();

      expect(onChangeWeight).toHaveBeenCalledExactlyOnceWith(QUESO);
    });

    it("locks the change of weight like the other controls", async () => {
      const { screen } = await renderLines({ busy: true }, [QUESO]);

      await expect
        .element(screen.getByRole("button", { name: "Cambiar el peso de Queso cremoso" }))
        .toBeDisabled();
    });
  });

  it("shows a unit line with no price per kilogram", async () => {
    const { screen } = await renderLines();

    await expect.element(screen.getByText(/el kg/)).not.toBeInTheDocument();
  });
});
