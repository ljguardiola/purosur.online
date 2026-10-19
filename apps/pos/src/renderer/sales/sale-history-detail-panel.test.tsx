import type { SaleHistoryDetailOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SaleDetail } from "../shell/sale-receipt-text";
import { render } from "../shell/test-support/render-with-router";
import { SaleHistoryDetailPanel } from "./sale-history-detail-panel";

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
  voidability: {
    kind: "voidable",
    refunds: [
      { method: "TRANSFER", amount: 3_070_000, state: "PENDING", sent_by_cloud: false },
      { method: "CASH", amount: 2_000_000, state: "APPROVED", sent_by_cloud: false },
    ],
  },
  void_authorization_required: false,
  reprint: { kind: "available" },
  next_copy: { kind: "duplicate", order_number: 1 },
  credit_note: null,
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
  const onVoid = vi.fn();
  const onPrintCreditNote = vi.fn();
  const screen = await render(
    <SaleHistoryDetailPanel
      saleId={"saleId" in options ? options.saleId : "sale-1"}
      readDetail={read}
      onReprint={onReprint}
      onVoid={onVoid}
      onPrintCreditNote={onPrintCreditNote}
    />,
  );
  return { screen, read, onReprint, onVoid, onPrintCreditNote };
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

  it("offers voiding a voidable sale next to the print button, and hands the sale over", async () => {
    const { screen, onVoid } = await renderPanel();

    await expect
      .element(screen.getByRole("button", { name: "Reimprimir duplicado" }))
      .toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));

    expect(onVoid).toHaveBeenCalledExactlyOnceWith(FISCAL_SALE);
    await expect
      .element(screen.getByText("Sin permiso para anular, se pide el PIN de alguien que lo tenga."))
      .not.toBeInTheDocument();
  });

  it("says another person's PIN is asked when the person may not void, and still offers voiding", async () => {
    const { screen, onVoid } = await renderPanel({
      read: async () => ({
        kind: "found",
        detail: { ...FISCAL_SALE, void_authorization_required: true },
      }),
    });

    await expect
      .element(screen.getByText("Sin permiso para anular, se pide el PIN de alguien que lo tenga."))
      .toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Anular venta" }));
    expect(onVoid).toHaveBeenCalledOnce();
  });

  it.each([
    ["session_closed", "La sesión de la venta ya cerró. Se tramita como devolución."],
    [
      "invoice_in_flight",
      "La factura se está pidiendo a ARCA. Vas a poder anular cuando termine el trámite.",
    ],
    [
      "invoice_needs_connection",
      "Sin conexión con ARCA, la venta con factura se anula cuando vuelva la conexión.",
    ],
  ] as const)(
    "locks voiding and says why only in its tooltip when the sale cannot be voided: %s",
    async (refusal, reason) => {
      const { screen, onVoid } = await renderPanel({
        read: async () => ({
          kind: "found",
          detail: { ...FISCAL_SALE, voidability: { kind: "not_voidable", refusal } },
        }),
      });
      const voidButton = screen.getByRole("button", { name: "Anular venta" });

      await expect.element(voidButton).toHaveAttribute("aria-disabled", "true");
      await expect.element(screen.getByText(reason)).not.toBeInTheDocument();
      await userEvent.hover(voidButton);
      await expect.element(screen.getByRole("tooltip")).toHaveTextContent(reason);
      voidButton.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(onVoid).not.toHaveBeenCalled();
      await expectNoAccessibilityViolations(screen.container);
      await userEvent.unhover(voidButton);
      await expect.element(screen.getByRole("tooltip")).not.toBeInTheDocument();
    },
  );

  it("shows a voided sale as voided, with no print or void button", async () => {
    const { screen } = await renderPanel({
      read: async () => ({
        kind: "found",
        detail: {
          ...FISCAL_SALE,
          state: "voided",
          voidability: { kind: "not_voidable", refusal: "not_completed" },
          reprint: { kind: "sale_voided" },
        },
      }),
    });

    await expect.element(screen.getByText("Estado", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Anulada", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /Anular/ })).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: /imprimir|Imprimir/ }))
      .not.toBeInTheDocument();
  });

  describe("the credit note of a voided sale", () => {
    const VOIDED = {
      ...FISCAL_SALE,
      state: "voided",
      voidability: { kind: "not_voidable", refusal: "not_completed" },
      reprint: { kind: "sale_voided" },
    } as const;

    it("shows the point of sale and number of an authorized one and prints it from its button", async () => {
      const authorized = {
        kind: "authorized",
        point_of_sale: 4,
        number: 12,
        issued_on: "2026-10-09",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-19",
      } as const;
      const { screen, onPrintCreditNote } = await renderPanel({
        read: async () => ({ kind: "found", detail: { ...VOIDED, credit_note: authorized } }),
      });

      await expect.element(screen.getByText("Nota de crédito C", { exact: true })).toBeVisible();
      await expect.element(screen.getByText("PV 00004 · Nº 00000012")).toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Imprimir nota de crédito" }));

      expect(onPrintCreditNote).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ sale_id: "sale-1" }),
      );
      await expectNoAccessibilityViolations(screen.container);
    });

    it.each([
      [{ kind: "in_progress" } as const, "En trámite con ARCA"],
      [{ kind: "rejected" } as const, "No emitida"],
      [{ kind: "already_credited" } as const, "No emitida: la factura ya tenía una"],
    ])("shows one that is not authorized and offers no printing: %j", async (creditNote, shown) => {
      const { screen } = await renderPanel({
        read: async () => ({ kind: "found", detail: { ...VOIDED, credit_note: creditNote } }),
      });

      await expect.element(screen.getByText("Nota de crédito C", { exact: true })).toBeVisible();
      await expect.element(screen.getByText(shown)).toBeVisible();
      await expect
        .element(screen.getByRole("button", { name: "Imprimir nota de crédito" }))
        .not.toBeInTheDocument();
    });

    it("shows none for a sale that had no invoice", async () => {
      const { screen } = await renderPanel({
        read: async () => ({ kind: "found", detail: { ...VOIDED, credit_note: null } }),
      });

      await expect.element(screen.getByText("Anulada", { exact: true })).toBeVisible();
      await expect
        .element(screen.getByText("Nota de crédito C", { exact: true }))
        .not.toBeInTheDocument();
    });
  });

  it("offers no printing when the core says the sale's receipt is not printed, and still offers voiding", async () => {
    const { screen } = await renderPanel({
      read: async () => ({
        kind: "found",
        detail: { ...FISCAL_SALE, reprint: { kind: "sale_voided" } },
      }),
    });

    await expect.element(screen.getByRole("button", { name: "Anular venta" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /imprimir|Imprimir/ }))
      .not.toBeInTheDocument();
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
