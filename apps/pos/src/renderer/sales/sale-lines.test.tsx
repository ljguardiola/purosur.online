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

async function renderLines(actions: Partial<SaleLineActions> = {}) {
  const onChangeQuantity = vi.fn();
  const onRemove = vi.fn();
  const screen = await render(
    <SaleLines
      lines={[YERBA]}
      changedLineId={undefined}
      actions={{
        busy: false,
        editable: true,
        lockedReason: undefined,
        onChangeQuantity,
        onRemove,
        ...actions,
      }}
    />,
  );
  return { screen, onChangeQuantity, onRemove };
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
});
