import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { CoreData } from "../platform/use-core-query";
import { render } from "../shell/test-support/render-with-router";
import type { SaleHistoryDetailPanelProps } from "./sale-history-detail-panel";
import { SaleHistoryDetailPanel } from "./sale-history-detail-panel";
import type { ShownSaleHistoryDetail } from "./sales-queries";
import { DETAIL } from "./test-support/sales-history-screen";

const AUTHORIZED_CREDIT_NOTE = {
  kind: "authorized",
  point_of_sale: 3,
  number: 21,
  issued_on: "2026-10-09",
  authorization_code: "75123456789012",
  authorization_code_due_on: "2026-10-19",
} as const;

function found(detail: typeof DETAIL): CoreData<ShownSaleHistoryDetail> {
  return { status: "loaded", value: { kind: "found", detail }, refreshing: false };
}

async function renderPanel(props: Partial<SaleHistoryDetailPanelProps> = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const onPress = vi.fn();
  const screen = await render(
    <SaleHistoryDetailPanel
      detail={found(DETAIL)}
      withDate={false}
      buttons={[{ key: "F5", label: "Reimprimir", primary: true, onPress }]}
      escape={false}
      {...props}
    />,
  );
  const panel = screen.getByRole("complementary", { name: "Detalle de la venta" });
  return { screen, panel, onPress };
}

describe("SaleHistoryDetailPanel", () => {
  it("asks to choose a sale while none is chosen", async () => {
    const { panel } = await renderPanel({ detail: undefined, buttons: [] });

    await expect.element(panel.getByText("DETALLE DE LA VENTA", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Elegí una venta para ver su detalle")).toBeVisible();
  });

  it("shows the Esc key when the list cannot be shown", async () => {
    const { panel } = await renderPanel({ detail: undefined, buttons: [], escape: true });

    await expect.element(panel.getByText("Esc", { exact: true })).toBeVisible();
  });

  it("shows the time of the sale, its total and its rows", async () => {
    const { screen, panel } = await renderPanel({
      detail: found({
        ...DETAIL,
        cash_rounding: 9_250,
        payments: [{ method: "CASH", card_type: null, amount: 5_060_750 }],
        short_code: "ABCD1234",
      }),
    });

    await expect.element(panel.getByText("VENTA · 11:42")).toBeVisible();
    await expect.element(panel.getByText("$ 50.700,00").first()).toBeVisible();
    await expect.element(panel.getByText("Factura C", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("00003-00001248")).toBeVisible();
    await expect.element(panel.getByText("Efectivo", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("$ 50.607,50")).toBeVisible();
    await expect.element(panel.getByText("Redondeo")).toBeVisible();
    await expect.element(panel.getByText("– $ 92,50")).toBeVisible();
    await expect.element(panel.getByText("Código de consulta")).toBeVisible();
    await expect.element(panel.getByText("ABCD-1234")).toBeVisible();
    await expect.element(panel.getByText("Operación", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("000482")).toBeVisible();
    await expect.element(panel.getByText("Atendió")).toBeVisible();
    await expect.element(panel.getByText("Tomás")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("leaves out the rounding, the operation and the short code the sale does not have", async () => {
    const { panel } = await renderPanel({
      detail: found({ ...DETAIL, operation_number: null, short_code: null, cash_rounding: 0 }),
    });

    await expect.element(panel.getByText("Redondeo")).not.toBeInTheDocument();
    await expect.element(panel.getByText("Operación", { exact: true })).not.toBeInTheDocument();
    await expect.element(panel.getByText("Código de consulta")).not.toBeInTheDocument();
  });

  it("does not show the state, a payments title or a count of lines", async () => {
    const { panel } = await renderPanel({ detail: found({ ...DETAIL, state: "voided" }) });

    await expect.element(panel.getByText("Estado", { exact: true })).not.toBeInTheDocument();
    await expect.element(panel.getByText("PAGOS")).not.toBeInTheDocument();
    await expect.element(panel.getByText(/líneas?$/)).not.toBeInTheDocument();
    await expect.element(panel.getByText(/Sin permiso para anular/)).not.toBeInTheDocument();
  });

  it("shows the date with the time when asked to", async () => {
    const { panel } = await renderPanel({ withDate: true });

    await expect.element(panel.getByText("VENTA · 09/10 · 11:42")).toBeVisible();
  });

  it("lists the product lines with their quantity and amount", async () => {
    const { panel } = await renderPanel({
      detail: found({
        ...DETAIL,
        lines: [
          {
            product_name: "Almendras peladas",
            sale_unit: "KG",
            quantity: 325,
            line_total: 614_250,
          },
          { product_name: "Yerba mate", sale_unit: "UNIT", quantity: 2, line_total: 1_390_000 },
        ],
      }),
    });

    await expect.element(panel.getByText("PRODUCTOS")).toBeVisible();
    const lines = panel.getByRole("list", { name: "Productos" });
    await expect.element(lines.getByText("Almendras peladas")).toBeVisible();
    await expect.element(lines.getByText("0,325 kg")).toBeVisible();
    await expect.element(lines.getByText("$ 6.142,50")).toBeVisible();
    await expect.element(lines.getByText("2 u")).toBeVisible();
    await expect.element(lines.getByText("$ 13.900,00")).toBeVisible();
  });

  it("shows the credit note of a voided sale with its number, and a Point payment with its card", async () => {
    const { panel } = await renderPanel({
      detail: found({
        ...DETAIL,
        state: "voided",
        payments: [{ method: "POINT", card_type: "DEBIT", amount: 5_070_000 }],
        credit_notes: [
          {
            credit_note_id: "cn-1",
            origin: "sale_void",
            standing: AUTHORIZED_CREDIT_NOTE,
            next_copy: { kind: "original" },
          },
        ],
      }),
    });

    await expect.element(panel.getByText("Nota de crédito C", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("00003-00000021")).toBeVisible();
    await expect.element(panel.getByText("Point débito")).toBeVisible();
  });

  it("says a deferred sale's document is not fiscal", async () => {
    const { panel } = await renderPanel({
      detail: found({ ...DETAIL, comprobante: { kind: "deferred_non_fiscal" }, state: "deferred" }),
    });

    await expect.element(panel.getByText("Documento no fiscal")).toBeVisible();
    await expect.element(panel.getByText("Venta diferida · falta facturar")).toBeVisible();
  });

  it("leaves the comprobante out when the sale has none", async () => {
    const { panel } = await renderPanel({
      detail: found({ ...DETAIL, comprobante: { kind: "none" } }),
    });

    await expect.element(panel.getByText("Factura C")).not.toBeInTheDocument();
    await expect.element(panel.getByText("Atendió")).toBeVisible();
  });

  it("shows each action as a button with its key, and presses it", async () => {
    const { panel, onPress } = await renderPanel();

    const button = panel.getByRole("button", { name: "Reimprimir" });
    await expect.element(button).toBeVisible();
    await expect.element(button.getByText("F5")).toBeVisible();
    await userEvent.click(button);

    expect(onPress).toHaveBeenCalledOnce();
  });

  it("shows a button without a key when the action has none", async () => {
    const { panel } = await renderPanel({
      buttons: [{ label: "Imprimir nota de crédito", primary: false, onPress: vi.fn() }],
    });

    await expect
      .element(panel.getByRole("button", { name: "Imprimir nota de crédito" }))
      .toBeVisible();
  });

  it("shows the sale loading, with no buttons", async () => {
    const { panel } = await renderPanel({ detail: { status: "loading" }, buttons: [] });

    await expect.element(panel.getByRole("button")).not.toBeInTheDocument();
  });

  it("says the sale could not be read and reads it again from Reintentar with R", async () => {
    const retry = vi.fn();
    const { panel } = await renderPanel({ detail: { status: "failed", retry }, buttons: [] });

    await expect.element(panel.getByText("DETALLE DE LA VENTA", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("No se pudo leer la venta")).toBeVisible();
    await expect.element(panel.getByText("Volvé a intentarlo en unos segundos.")).toBeVisible();
    const button = panel.getByRole("button", { name: "Reintentar" });
    await expect.element(button.getByText("R", { exact: true })).toBeVisible();
    await userEvent.click(button);

    expect(retry).toHaveBeenCalledOnce();
  });

  it.each([
    [{ kind: "not_found" }, "La venta ya no está en el historial"],
    [{ kind: "lacks_permission" }, "No tenés permiso para ver esta venta"],
    [{ kind: "not_signed_in" }, "La sesión terminó. Volvé a ingresar para ver la venta"],
  ] as const)("says what happened when the core answers %j", async (value, title) => {
    const { panel } = await renderPanel({
      detail: { status: "loaded", value, refreshing: false },
      buttons: [],
    });

    await expect.element(panel.getByText(title)).toBeVisible();
  });
});
