import type { OpenSale } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
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
  line_total: 476_000,
};
const LOCKED_REASON = "La venta ya no se puede cambiar porque tiene un pago aprobado.";
const CONTROLS = [
  "Bajar la cantidad de Yerba mate 1 kg",
  "Subir la cantidad de Yerba mate 1 kg",
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
  line_total: 1_562_500,
};

async function renderLines(
  actions: Partial<SaleLineActions> = {},
  lines: OpenSale["lines"] = [YERBA],
) {
  const onChangeQuantity = vi.fn();
  const onChangeWeight = vi.fn();
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
        onRemove,
        ...actions,
      }}
    />,
  );
  return { screen, onChangeQuantity, onChangeWeight, onRemove };
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
    it("shows its weight, its price per kilogram and that the weight was typed, with no quantity steppers", async () => {
      const { screen } = await renderLines({}, [QUESO]);

      await expect.element(screen.getByText("1,250 kg")).toBeVisible();
      await expect.element(screen.getByText("$ 12.500,00 el kg")).toBeVisible();
      await expect.element(screen.getByText("Peso tipeado")).toBeVisible();
      await expect.element(screen.getByText("$ 15.625,00")).toBeVisible();
      await expect
        .element(screen.getByRole("button", { name: "Subir la cantidad de Queso cremoso" }))
        .not.toBeInTheDocument();
      await expect
        .element(screen.getByRole("button", { name: "Bajar la cantidad de Queso cremoso" }))
        .not.toBeInTheDocument();
    });

    it("does not say the weight was typed when it came from the scale", async () => {
      const { screen } = await renderLines({}, [{ ...QUESO, weight_source: "SCALE" }]);

      await expect.element(screen.getByText("1,250 kg")).toBeVisible();
      await expect.element(screen.getByText("Peso tipeado")).not.toBeInTheDocument();
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

  it("shows a unit line with neither a price per kilogram nor a typed weight tag", async () => {
    const { screen } = await renderLines();

    await expect.element(screen.getByText("Peso tipeado")).not.toBeInTheDocument();
    await expect.element(screen.getByText(/el kg/)).not.toBeInTheDocument();
  });
});
