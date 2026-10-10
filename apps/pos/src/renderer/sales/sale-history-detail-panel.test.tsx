import type { SaleHistoryDetailOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { SaleHistoryDetailPanel } from "./sale-history-detail-panel";
import type { SaleDetail } from "./sale-history-text";

const FISCAL_SALE: SaleDetail = {
  sale_id: "sale-1",
  occurred_at: "2026-10-09T11:05:00.000-03:00",
  total: 5_070_000,
  comprobante: { kind: "fiscal", document_type: "factura_c", point_of_sale: 4, number: 319 },
  operation_number: 482,
  served_by_first_name: "Tomás",
  line_count: 8,
  payments: [
    { method: "TRANSFER", amount: 3_070_000 },
    { method: "CASH", amount: 2_000_000 },
  ],
  state: "completed",
  next_copy: { kind: "duplicate", order_number: 1 },
};

async function renderPanel(
  options: {
    saleId?: string | undefined;
    read?: (saleId: string) => Promise<SaleHistoryDetailOutcome>;
  } = {},
) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const read = vi.fn(
    options.read ??
      (async (): Promise<SaleHistoryDetailOutcome> => ({ kind: "found", detail: FISCAL_SALE })),
  );
  const onReprint = vi.fn();
  const screen = await render(
    <SaleHistoryDetailPanel
      saleId={"saleId" in options ? options.saleId : "sale-1"}
      readDetail={read}
      onReprint={onReprint}
    />,
  );
  return { screen, read, onReprint };
}

describe("SaleHistoryDetailPanel", () => {
  it("asks to choose a sale while none is chosen, and reads nothing", async () => {
    const { screen, read } = await renderPanel({ saleId: undefined });

    await expect.element(screen.getByText("Elegí una venta para ver su detalle")).toBeVisible();
    expect(read).not.toHaveBeenCalled();
  });

  it("shows the sale's total, comprobante, number, operation, who served it, its lines and its payments", async () => {
    const { screen, read } = await renderPanel();

    await expect.element(screen.getByText("VENTA DE LAS 11:05")).toBeVisible();
    await expect.element(screen.getByText("$ 50.700,00").first()).toBeVisible();
    await expect.element(screen.getByText("Comprobante", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Factura C", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Número", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("PV 00004 · Nº 00000319")).toBeVisible();
    await expect.element(screen.getByText("Operación", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("000482")).toBeVisible();
    await expect.element(screen.getByText("Atendió")).toBeVisible();
    await expect.element(screen.getByText("Tomás")).toBeVisible();
    await expect.element(screen.getByText("8 líneas")).toBeVisible();
    await expect.element(screen.getByText("PAGOS")).toBeVisible();
    await expect.element(screen.getByText("Transferencia", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 30.700,00")).toBeVisible();
    await expect.element(screen.getByText("Efectivo", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 20.000,00")).toBeVisible();
    expect(read).toHaveBeenCalledWith("sale-1");
    await expectNoAccessibilityViolations(screen.container);
  });

  it("names a payment by Mercado Pago QR with its amount", async () => {
    const { screen } = await renderPanel({
      read: async () => ({
        kind: "found",
        detail: { ...FISCAL_SALE, payments: [{ method: "QR", amount: 3_070_000 }] },
      }),
    });

    await expect.element(screen.getByText("QR de Mercado Pago", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 30.700,00").first()).toBeVisible();
  });

  it("says one line in the singular", async () => {
    const { screen } = await renderPanel({
      read: async () => ({ kind: "found", detail: { ...FISCAL_SALE, line_count: 1 } }),
    });

    await expect.element(screen.getByText("1 línea", { exact: true })).toBeVisible();
  });

  it("says a deferred sale's document is not fiscal and still has to be invoiced", async () => {
    const { screen } = await renderPanel({
      read: async () => ({
        kind: "found",
        detail: { ...FISCAL_SALE, comprobante: { kind: "deferred_non_fiscal" }, state: "deferred" },
      }),
    });

    await expect.element(screen.getByText("Documento no fiscal")).toBeVisible();
    await expect.element(screen.getByText("Venta diferida · falta facturar")).toBeVisible();
  });

  it("leaves the comprobante rows out when the sale has none, and keeps the operation", async () => {
    const { screen } = await renderPanel({
      read: async () => ({
        kind: "found",
        detail: { ...FISCAL_SALE, comprobante: { kind: "none" }, state: "in_progress" },
      }),
    });

    await expect.element(screen.getByText("000482")).toBeVisible();
    await expect.element(screen.getByText("Comprobante", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("Número", { exact: true })).not.toBeInTheDocument();
  });

  it("offers reprinting a duplicate when the core says the next copy is one, and hands the sale over", async () => {
    const { screen, onReprint } = await renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Reimprimir duplicado" }));

    expect(onReprint).toHaveBeenCalledExactlyOnceWith(FISCAL_SALE);
  });

  it("offers printing the original when the core says the next copy is the original", async () => {
    const { screen } = await renderPanel({
      read: async () => ({
        kind: "found",
        detail: { ...FISCAL_SALE, next_copy: { kind: "original" } },
      }),
    });

    await expect.element(screen.getByRole("button", { name: "Imprimir original" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Reimprimir duplicado" }))
      .not.toBeInTheDocument();
  });

  it("offers no way to cancel the sale", async () => {
    const { screen } = await renderPanel();

    await expect.element(screen.getByText("VENTA DE LAS 11:05")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /Anular/ })).not.toBeInTheDocument();
  });

  it("shows the sale loading, with no print button yet", async () => {
    const { screen } = await renderPanel({ read: () => new Promise(() => {}) });

    expect(screen.container.querySelector("[aria-busy=true]")).not.toBeNull();
    await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
  });

  it("says the sale could not be read and reads it again on retry", async () => {
    const answers: SaleHistoryDetailOutcome[] = [
      { kind: "unavailable" },
      { kind: "found", detail: FISCAL_SALE },
    ];
    const { screen, read } = await renderPanel({
      read: async () => answers.shift() ?? { kind: "unavailable" },
    });

    await expect.element(screen.getByText("No se pudo leer la venta")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(screen.getByText("VENTA DE LAS 11:05")).toBeVisible();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("says the sale is no longer there", async () => {
    const { screen } = await renderPanel({ read: async () => ({ kind: "not_found" }) });

    await expect.element(screen.getByText("La venta ya no está en el historial")).toBeVisible();
  });

  it("says the person may not see the sale", async () => {
    const { screen } = await renderPanel({ read: async () => ({ kind: "lacks_permission" }) });

    await expect.element(screen.getByText("No tenés permiso para ver esta venta")).toBeVisible();
  });

  it("says the session is over, not that the person lacks permission, when nobody is signed in", async () => {
    const { screen } = await renderPanel({ read: async () => ({ kind: "not_signed_in" }) });

    await expect
      .element(screen.getByText("La sesión terminó. Volvé a ingresar para ver la venta"))
      .toBeVisible();
    await expect
      .element(screen.getByText("No tenés permiso para ver esta venta"))
      .not.toBeInTheDocument();
  });
});
