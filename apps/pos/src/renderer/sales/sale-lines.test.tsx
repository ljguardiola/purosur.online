import type { OpenSale } from "@purosur/contracts";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page } from "vitest/browser";
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

const LEGEND = [
  { keyName: "ArrowUpDown", label: "Líneas" },
  { keyName: "F2", label: "Buscar" },
] as const;

async function renderLines({
  actions = {},
  lines = [YERBA],
  selectedLineId = undefined,
  failed = false,
}: {
  actions?: Partial<SaleLineActions>;
  lines?: OpenSale["lines"];
  selectedLineId?: string | undefined;
  failed?: boolean;
} = {}) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  const onChangeWeight = vi.fn();
  const onAdjust = vi.fn();
  const onRemove = vi.fn();
  const onSelect = vi.fn();
  const screen = await render(
    <SaleLines
      lines={lines}
      selectedLineId={selectedLineId}
      legend={LEGEND}
      failed={failed}
      onSelect={onSelect}
      actions={{
        busy: false,
        weighing: false,
        editable: true,
        onChangeWeight,
        onAdjust,
        onRemove,
        ...actions,
      }}
    />,
  );
  return { screen, onChangeWeight, onAdjust, onRemove, onSelect };
}

describe("SaleLines", () => {
  it("shows each line in the columns Producto, Precio, Cantidad and Importe", async () => {
    const { screen } = await renderLines({ lines: [YERBA, QUESO] });

    const headers = screen.getByRole("columnheader");
    await expect.element(headers.nth(0)).toHaveTextContent("Producto");
    await expect.element(headers.nth(1)).toHaveTextContent("Precio");
    await expect.element(headers.nth(2)).toHaveTextContent("Cantidad");
    await expect.element(headers.nth(3)).toHaveTextContent("Importe");
    const yerba = screen.getByRole("row").nth(1);
    expect(yerba.element().textContent).toMatch(/Yerba mate 1 kg/);
    expect(yerba.element().textContent).toMatch(/\$ 2\.380,00 \/ u/);
    expect(yerba.element().textContent).toMatch(/2 u/);
    expect(yerba.element().textContent).toMatch(/\$ 4\.760,00/);
    const queso = screen.getByRole("row").nth(2);
    expect(queso.element().textContent).toMatch(/\$ 12\.500,00 \/ kg/);
    expect(queso.element().textContent).toMatch(/1,250 kg/);
    expect(queso.element().textContent).toMatch(/\$ 15\.625,00/);
  });

  it("marks the selected line only", async () => {
    const { screen } = await renderLines({ lines: [YERBA, QUESO], selectedLineId: "line-3" });

    const rows = screen.getByRole("row");
    await expect.element(rows.nth(2)).toHaveAttribute("aria-current", "true");
    await expect.element(rows.nth(1)).not.toHaveAttribute("aria-current");
  });

  it("asks to select the line that is pressed", async () => {
    const { screen, onSelect } = await renderLines({ lines: [YERBA, QUESO] });

    await screen.getByText("Queso cremoso").click();

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(QUESO);
  });

  it("draws a scale on a weighed line and a box on a unit line", async () => {
    const { screen } = await renderLines({ lines: [YERBA, QUESO] });

    const unit = screen.getByRole("row").nth(1).element();
    const weighed = screen.getByRole("row").nth(2).element();
    expect(unit.querySelector("svg.lucide-package")).not.toBeNull();
    expect(unit.querySelector("svg.lucide-scale")).toBeNull();
    expect(weighed.querySelector("svg.lucide-scale")).not.toBeNull();
    expect(weighed.querySelector("svg.lucide-package")).toBeNull();
  });

  it("shows the legend inside the card", async () => {
    const { screen } = await renderLines();

    const legend = screen.getByRole("listitem");
    expect(legend.nth(0).element().textContent).toMatch(/Líneas/);
    expect(legend.nth(1).element().textContent).toMatch(/Buscar/);
  });

  it("says the sale is empty, with the legend and no column header, when there are no lines", async () => {
    const { screen } = await renderLines({ lines: [] });

    await expect.element(screen.getByText("La venta está vacía")).toBeVisible();
    expect(screen.getByRole("listitem").nth(1).element().textContent).toMatch(/Buscar/);
    await expect.element(screen.getByRole("columnheader")).not.toBeInTheDocument();
  });

  it("says the sale could not be loaded, with no button to try again", async () => {
    const { screen } = await renderLines({ lines: [], failed: true });

    await expect.element(screen.getByText("No se pudo cargar la venta")).toBeVisible();
    await expect.element(screen.getByText("Volvé a intentarlo en unos segundos.")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Reintentar" }))
      .not.toBeInTheDocument();
  });

  it("removes a line and asks to change its price while the sale can be changed", async () => {
    const { screen, onRemove, onAdjust } = await renderLines();

    await screen.getByRole("button", { name: "Cambiar el precio de Yerba mate 1 kg" }).click();
    await screen.getByRole("button", { name: "Quitar Yerba mate 1 kg" }).click();

    expect(onAdjust).toHaveBeenCalledExactlyOnceWith(YERBA);
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(YERBA);
  });

  it("has no buttons to raise or lower the quantity, which the keypad's plus and minus change", async () => {
    const { screen } = await renderLines();

    await expect
      .element(screen.getByRole("button", { name: "Subir la cantidad de Yerba mate 1 kg" }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Bajar la cantidad de Yerba mate 1 kg" }))
      .not.toBeInTheDocument();
  });

  describe("a line with a manual adjustment", () => {
    it("shows the percentage discount in place of a promotion, with the price before it struck out", async () => {
      const discounted: OpenSale["lines"][number] = {
        ...YERBA,
        discount_amount: 47_600,
        manual_adjustment: {
          kind: "PERCENT",
          value: 10,
        },
        line_total: 428_400,
      };
      const { screen } = await renderLines({ lines: [discounted] });

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
        },
        line_total: 426_000,
      };
      const { screen } = await renderLines({ lines: [discounted] });

      await expect.element(screen.getByText("Descuento manual $ 500,00")).toBeVisible();
    });

    it("shows a new price as modified, with nothing struck out", async () => {
      const repriced: OpenSale["lines"][number] = {
        ...YERBA,
        manual_adjustment: {
          kind: "PRICE",
          value: 200_000,
        },
        line_total: 400_000,
      };
      const { screen } = await renderLines({ lines: [repriced] });

      await expect.element(screen.getByText("Precio modificado: $ 2.000,00")).toBeVisible();
      await expect.element(screen.getByText("$ 4.000,00")).toBeVisible();
      expect(document.querySelector("s")).toBeNull();
    });
  });

  it("disables every control of a line while a change is answering", async () => {
    const { screen } = await renderLines({ actions: { busy: true }, lines: [YERBA, QUESO] });

    for (const name of [
      "Cambiar el precio de Yerba mate 1 kg",
      "Quitar Yerba mate 1 kg",
      "Cambiar el peso de Queso cremoso",
      "Cambiar el precio de Queso cremoso",
      "Quitar Queso cremoso",
    ]) {
      await expect.element(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  it("disables changing the weight and removing a line while a weighing is in progress, leaving the change of price", async () => {
    const { screen } = await renderLines({ actions: { weighing: true }, lines: [YERBA, QUESO] });

    for (const name of [
      "Quitar Yerba mate 1 kg",
      "Cambiar el peso de Queso cremoso",
      "Quitar Queso cremoso",
    ]) {
      await expect.element(screen.getByRole("button", { name })).toBeDisabled();
    }
    for (const name of [
      "Cambiar el precio de Yerba mate 1 kg",
      "Cambiar el precio de Queso cremoso",
    ]) {
      await expect.element(screen.getByRole("button", { name })).toBeEnabled();
    }
  });

  it("offers no control on a line once the sale can no longer be changed", async () => {
    const { screen } = await renderLines({
      actions: { editable: false },
      lines: [YERBA, QUESO],
    });

    await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
  });

  describe("a line sold by the kilogram", () => {
    it("shows its weight and its price per kilogram, with nothing about where the weight came from", async () => {
      const { screen } = await renderLines({ lines: [QUESO] });

      await expect.element(screen.getByText("1,250 kg")).toBeVisible();
      await expect.element(screen.getByText("$ 12.500,00 / kg")).toBeVisible();
      await expect.element(screen.getByText("Peso tipeado")).not.toBeInTheDocument();
      await expect.element(screen.getByText("$ 15.625,00")).toBeVisible();
    });

    it("asks to change the weight of the line", async () => {
      const { screen, onChangeWeight } = await renderLines({ lines: [QUESO] });

      await screen.getByRole("button", { name: "Cambiar el peso de Queso cremoso" }).click();

      expect(onChangeWeight).toHaveBeenCalledExactlyOnceWith(QUESO);
    });
  });

  it("shows a unit line with no button to change its weight", async () => {
    const { screen } = await renderLines();

    await expect
      .element(screen.getByRole("button", { name: "Cambiar el peso de Yerba mate 1 kg" }))
      .not.toBeInTheDocument();
  });
});
