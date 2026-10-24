import type { PrintDeferredSaleInvoiceOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import { render } from "../shell/test-support/render-with-router";
import type { PrintDeferredInvoiceModalProps } from "./print-deferred-invoice-modal";
import { PrintDeferredInvoiceModal } from "./print-deferred-invoice-modal";

const ISSUED_SALE: PrintDeferredInvoiceModalProps["sale"] = {
  sale_id: "sale-1",
  occurred_at: "2026-09-16T10:20:00.000-03:00",
  total: 329_999,
  invoice: { kind: "issued", point_of_sale: 3, number: 1250 },
};
const PENDING_SALE: PrintDeferredInvoiceModalProps["sale"] = {
  ...ISSUED_SALE,
  invoice: { kind: "pending" },
};

async function renderModal(overrides: Partial<PrintDeferredInvoiceModalProps> = {}) {
  await page.viewport(1280, 900);
  const props = {
    sale: ISSUED_SALE,
    printInvoice: vi.fn(
      async (): Promise<PrintDeferredSaleInvoiceOutcome> => ({
        kind: "started",
        copy: { kind: "original" },
      }),
    ),
    onPrinted: vi.fn(),
    onRefused: vi.fn(),
    onSessionInvalid: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const screen = await render(<PrintDeferredInvoiceModal {...props} />);
  return { screen, ...props };
}

const PRINT = "Imprimir la factura";

describe("PrintDeferredInvoiceModal", () => {
  it("shows the sale about to be invoiced, with its invoice number", async () => {
    const { screen } = await renderModal();

    const dialog = screen.getByRole("dialog", { name: "Imprimí la factura" });
    await expect.element(dialog).toBeVisible();
    await expect.element(dialog.getByText("EL CLIENTE VOLVIÓ POR SU FACTURA")).toBeVisible();
    await expect.element(dialog.getByText("$ 3.299,99")).toBeVisible();
    await expect.element(dialog.getByText("Factura C")).toBeVisible();
    await expect.element(dialog.getByText(/PV 00003/)).toBeVisible();
    await expect.element(dialog.getByText(/Nº 00001250/)).toBeVisible();
    await expect.element(dialog.getByText("16/09/2026 · 10:20")).toBeVisible();
    await expect
      .element(
        dialog.getByText(
          "Sale como original, con la fecha de la venta. El papel que tiene el cliente ya no hace falta.",
        ),
      )
      .toBeVisible();
  });

  it("says the number is assigned on issuing when the invoice is still pending", async () => {
    const { screen } = await renderModal({ sale: PENDING_SALE });

    await expect.element(screen.getByText("Se asigna al emitir")).toBeVisible();
  });

  it("has no accessibility violations", async () => {
    await renderModal();

    await expectNoAccessibilityViolations(document.body);
  });

  it("closes without printing from Volver", async () => {
    const { screen, printInvoice, onClose } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(printInvoice).not.toHaveBeenCalled();
  });

  it("asks the core to print the sale's invoice and reports it printed once it started", async () => {
    const { screen, printInvoice, onPrinted } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    expect(printInvoice).toHaveBeenCalledExactlyOnceWith("sale-1");
    await vi.waitFor(() => expect(onPrinted).toHaveBeenCalledOnce());
  });

  it.each([
    ["issuing the invoice of a pending sale", PENDING_SALE, "Emitiendo la factura…"],
    ["printing the invoice already issued", ISSUED_SALE, "Imprimiendo la factura…"],
  ] as const)(
    "shows it is %s while the core works, without letting it be asked again",
    async (_case, sale, label) => {
      const answer = deferred<PrintDeferredSaleInvoiceOutcome>();
      const { screen, printInvoice, onClose } = await renderModal({
        sale,
        printInvoice: vi.fn(() => answer.promise),
      });

      await userEvent.click(screen.getByRole("button", { name: PRINT }));

      const pending = screen.getByRole("button", { name: label });
      await expect.element(pending).toBeVisible();
      await expect.element(pending).toBeDisabled();
      expect(printInvoice).toHaveBeenCalledOnce();
      await expect.element(screen.getByRole("button", { name: "Volver" })).toBeDisabled();
      expect(onClose).not.toHaveBeenCalled();
      answer.resolve({ kind: "started", copy: { kind: "original" } });
    },
  );

  it.each([
    [
      "cannot_authorize",
      "La caja no puede pedir facturas a ARCA ahora. No se imprimió nada; pedile al cliente que vuelva más tarde.",
    ],
    [
      "older_sale_blocking",
      "Una venta anterior está frenando la facturación. No se imprimió nada; pedile al cliente que vuelva más tarde.",
    ],
    [
      "not_authorized",
      "ARCA no autorizó la factura de esta venta. No se imprimió nada; pedile al cliente que vuelva más tarde.",
    ],
  ] as const)(
    "stays open and says nothing was printed when it is not yet possible (%s)",
    async (cause, text) => {
      const { screen, onPrinted, onRefused } = await renderModal({
        printInvoice: async () => ({ kind: "not_yet", cause }),
      });

      await userEvent.click(screen.getByRole("button", { name: PRINT }));

      await expect.element(screen.getByText("Todavía no se puede facturar")).toBeVisible();
      await expect.element(screen.getByText(text)).toBeVisible();
      await expect.element(screen.getByRole("dialog")).toBeVisible();
      await expect.element(screen.getByRole("button", { name: PRINT })).toBeEnabled();
      expect(onPrinted).not.toHaveBeenCalled();
      expect(onRefused).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["already_printed", "already_printed"],
    ["voided", "voided"],
    ["sale_voided", "voided"],
    ["expired", "expired"],
    ["out_of_date_order", "out_of_date_order"],
    ["not_found", "not_found"],
  ] as const)("hands the screen the refusal when the core answers %s", async (kind, refusal) => {
    const { screen, onRefused, onPrinted } = await renderModal({
      printInvoice: async () => ({ kind }),
    });

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    await vi.waitFor(() => expect(onRefused).toHaveBeenCalledExactlyOnceWith(refusal));
    expect(onPrinted).not.toHaveBeenCalled();
  });

  it("stays open with the printing notice when the core cannot print it now", async () => {
    const { screen, onPrinted } = await renderModal({
      printInvoice: async () => ({ kind: "printer_not_configured" }),
    });

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    await expect.element(screen.getByText("La impresora no está configurada")).toBeVisible();
    await expect.element(screen.getByText("Configurala para imprimir la factura.")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: PRINT })).toBeEnabled();
    expect(onPrinted).not.toHaveBeenCalled();
  });

  it("says it could not print when the core does not answer", async () => {
    const { screen } = await renderModal({
      printInvoice: async () => {
        throw new Error("core down");
      },
    });

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    await expect.element(screen.getByText("No se pudo imprimir la factura")).toBeVisible();
  });

  it("tells the screen the session ended when the core says nobody is signed in", async () => {
    const { screen, onSessionInvalid } = await renderModal({
      printInvoice: async () => ({ kind: "not_signed_in" }),
    });

    await userEvent.click(screen.getByRole("button", { name: PRINT }));

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });
});
