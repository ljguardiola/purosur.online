import type { FindDeferredSaleOutcome, PrintDeferredSaleInvoiceOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import {
  FOUND_ISSUED,
  FOUND_PENDING,
  QR_TEXT,
  renderScreen,
} from "./test-support/deferred-sale-screen";

function keycapOf(button: { element: () => Element }) {
  return button.element().querySelector("kbd")?.textContent;
}

describe("DeferredSaleScreen waiting for the customer's document", () => {
  it("asks for the document's QR in the lines' place, with the panel titled Venta diferida", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("Acercá el QR del documento al lector")).toBeVisible();
    await expect
      .element(screen.getByRole("complementary", { name: "Venta diferida" }))
      .toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "Venta diferida" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cerrar con Esc" })).toBeVisible();
  });

  it("offers no field to type the code, no search and no scale", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Código de consulta")).not.toBeInTheDocument();
    await expect.element(screen.getByText("BALANZA")).not.toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    await renderScreen();

    await expectNoAccessibilityViolations(document.body);
  });

  it("looks the sale up by the text of the QR the reader reads", async () => {
    const { findDeferredSale, readBarcode } = await renderScreen();

    readBarcode(QR_TEXT);

    await vi.waitFor(() =>
      expect(findDeferredSale).toHaveBeenCalledExactlyOnceWith({ kind: "scanned", text: QR_TEXT }),
    );
  });

  it("looks the sale up on arrival with the reading the sale screen carried", async () => {
    const { findDeferredSale } = await renderScreen({ reading: QR_TEXT });

    await vi.waitFor(() =>
      expect(findDeferredSale).toHaveBeenCalledExactlyOnceWith({ kind: "scanned", text: QR_TEXT }),
    );
  });

  it("shows the lines loading, not the prompt for the QR, while the sale is looked up", async () => {
    const answer = deferred<FindDeferredSaleOutcome>();
    const { screen } = await renderScreen({
      reading: QR_TEXT,
      findDeferredSale: vi.fn(() => answer.promise),
    });

    await expect
      .element(screen.getByRole("table", { name: "Líneas de la venta" }))
      .toHaveAttribute("aria-busy", "true");
    await expect
      .element(screen.getByText("Acercá el QR del documento al lector"))
      .not.toBeInTheDocument();
    answer.resolve({ kind: "not_found" });
  });

  it("says a scanned code that is not a deferred sale's QR is not one, without asking the core", async () => {
    const { screen, findDeferredSale, readBarcode } = await renderScreen();

    readBarcode("7790001");

    await expect.element(screen.getByText("Ese QR no es de una venta diferida")).toBeVisible();
    await expect.element(screen.getByText("Escaneá el QR del documento no fiscal.")).toBeVisible();
    expect(findDeferredSale).not.toHaveBeenCalled();
  });

  it("tells the refusal the core answers, in the panel, without opening the invoice", async () => {
    const { screen } = await renderScreen({
      reading: QR_TEXT,
      findDeferredSale: async () => ({ kind: "voided" }),
    });

    await expect.element(screen.getByText("Esa venta se anuló")).toBeVisible();
    await expect.element(screen.getByText("Una venta anulada no se factura.")).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Imprimir factura" }))
      .not.toBeInTheDocument();
  });

  it("says it could not look the sale up when the core does not answer", async () => {
    const { screen } = await renderScreen({
      reading: QR_TEXT,
      findDeferredSale: async () => {
        throw new Error("core down");
      },
    });

    await expect.element(screen.getByText("No se pudo buscar la venta")).toBeVisible();
  });

  it("looks the sale up again from loading when the screen is reached again with the same QR", async () => {
    const coreDown = deferred<void>();
    const { screen, leaveAndReturn } = await renderScreen({
      reading: QR_TEXT,
      findDeferredSale: vi
        .fn()
        .mockResolvedValueOnce(FOUND_ISSUED)
        .mockImplementationOnce(async () => {
          await coreDown.promise;
          throw new Error("core down");
        }),
    });
    await expect.element(screen.getByRole("button", { name: "Imprimir factura" })).toBeVisible();

    await leaveAndReturn();

    await expect
      .element(screen.getByRole("table", { name: "Líneas de la venta" }))
      .toHaveAttribute("aria-busy", "true");
    await expect
      .element(screen.getByRole("button", { name: "Imprimir factura" }))
      .not.toBeInTheDocument();
    coreDown.resolve();
    await expect.element(screen.getByText("No se pudo buscar la venta")).toBeVisible();
  });

  it("offers Reintentar with the R key on the failed lookup, and looks the same QR up again from loading", async () => {
    const second = deferred<FindDeferredSaleOutcome>();
    const findDeferredSale = vi
      .fn()
      .mockRejectedValueOnce(new Error("core down"))
      .mockReturnValueOnce(second.promise);
    const { screen } = await renderScreen({ reading: QR_TEXT, findDeferredSale });
    await expect.element(screen.getByText("No se pudo buscar la venta")).toBeVisible();
    const retry = screen.getByRole("button", { name: "Reintentar" });
    expect(keycapOf(retry)).toBe("R");

    await userEvent.click(retry);

    await expect
      .element(screen.getByRole("table", { name: "Líneas de la venta" }))
      .toHaveAttribute("aria-busy", "true");
    await expect.element(screen.getByText("No se pudo buscar la venta")).not.toBeInTheDocument();
    expect(findDeferredSale).toHaveBeenCalledTimes(2);
    expect(findDeferredSale).toHaveBeenLastCalledWith({ kind: "scanned", text: QR_TEXT });
    second.resolve(FOUND_ISSUED);
    await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  });

  it("looks the QR up again when R is pressed on the failed lookup", async () => {
    const findDeferredSale = vi
      .fn()
      .mockRejectedValueOnce(new Error("core down"))
      .mockResolvedValueOnce(FOUND_ISSUED);
    const { screen } = await renderScreen({ reading: QR_TEXT, findDeferredSale });
    await expect.element(screen.getByText("No se pudo buscar la venta")).toBeVisible();

    await userEvent.keyboard("r");

    await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
    expect(findDeferredSale).toHaveBeenCalledTimes(2);
  });

  it("offers no Reintentar once a code that is not a deferred sale's QR replaces the failed lookup", async () => {
    const findDeferredSale = vi
      .fn()
      .mockRejectedValueOnce(new Error("core down"))
      .mockResolvedValueOnce(FOUND_ISSUED);
    const { screen, readBarcode } = await renderScreen({ reading: QR_TEXT, findDeferredSale });
    await expect.element(screen.getByText("No se pudo buscar la venta")).toBeVisible();

    readBarcode("7790001");

    await expect.element(screen.getByText("Ese QR no es de una venta diferida")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Reintentar" }))
      .not.toBeInTheDocument();
    await userEvent.keyboard("r");
    readBarcode(QR_TEXT);
    await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
    await expect
      .element(screen.getByText("Ese QR no es de una venta diferida"))
      .not.toBeInTheDocument();
    expect(findDeferredSale).toHaveBeenCalledTimes(2);
  });

  it("offers no Reintentar for a refusal the core answered", async () => {
    const { screen } = await renderScreen({
      reading: QR_TEXT,
      findDeferredSale: async () => ({ kind: "voided" }),
    });

    await expect.element(screen.getByText("Esa venta se anuló")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Reintentar" }))
      .not.toBeInTheDocument();
  });

  it("tells the app the session ended when the core says nobody is signed in", async () => {
    const { onSessionInvalid } = await renderScreen({
      reading: QR_TEXT,
      findDeferredSale: async () => ({ kind: "not_signed_in" }),
    });

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });

  it("does not ask for the sale again while the first answer is awaited", async () => {
    const answer = deferred<FindDeferredSaleOutcome>();
    const { findDeferredSale, readBarcode } = await renderScreen({
      reading: QR_TEXT,
      findDeferredSale: vi.fn(() => answer.promise),
    });

    readBarcode(QR_TEXT);

    expect(findDeferredSale).toHaveBeenCalledOnce();
    answer.resolve({ kind: "not_found" });
  });

  it("clears the previous refusal when the reader reads another QR", async () => {
    const { screen, readBarcode } = await renderScreen({
      reading: QR_TEXT,
      findDeferredSale: vi
        .fn()
        .mockResolvedValueOnce({ kind: "voided" })
        .mockResolvedValueOnce(FOUND_ISSUED),
    });
    await expect.element(screen.getByText("Esa venta se anuló")).toBeVisible();

    readBarcode(QR_TEXT);

    await expect.element(screen.getByText("Esa venta se anuló")).not.toBeInTheDocument();
  });
});

describe("DeferredSaleScreen showing the sale it found", () => {
  async function shown(overrides: Parameters<typeof renderScreen>[0] = {}) {
    const rendered = await renderScreen({
      reading: QR_TEXT,
      findDeferredSale: async () => FOUND_ISSUED,
      ...overrides,
    });
    await expect
      .element(rendered.screen.getByRole("button", { name: "Imprimir factura" }))
      .toBeVisible();
    return rendered;
  }

  it("lists the lines of the sale the core found", async () => {
    const { screen } = await shown();

    const table = screen.getByRole("table", { name: "Líneas de la venta" });
    await expect.element(table.getByText("Almendras peladas")).toBeVisible();
    await expect.element(table.getByText("Yerba mate orgánica 1 kg")).toBeVisible();
  });

  it("leaves no line selectable", async () => {
    const { screen } = await shown();

    await userEvent.click(screen.getByText("Almendras peladas"));

    await expect
      .element(screen.getByRole("row", { name: /Almendras peladas/ }))
      .not.toHaveAttribute("aria-current");
  });

  it("shows the total, the sale's time, the comprobante and the item count the core answered", async () => {
    const { screen } = await shown({
      findDeferredSale: async () => ({ ...FOUND_ISSUED, item_count: 3 }),
    });

    const panel = screen.getByRole("complementary", { name: "Venta diferida" });
    await expect.element(panel.getByText("TOTAL")).toBeVisible();
    await expect.element(panel.getByText("$ 16.400,00")).toBeVisible();
    await expect.element(panel.getByText("Venta del")).toBeVisible();
    await expect.element(panel.getByText("04/11 · 14:02")).toBeVisible();
    await expect.element(panel.getByText("Comprobante")).toBeVisible();
    await expect.element(panel.getByText("Factura C · 00003-00000187")).toBeVisible();
    await expect.element(panel.getByText("Artículos")).toBeVisible();
    await expect.element(panel.getByText("3", { exact: true })).toBeVisible();
  });

  it("says the invoice is assigned on issuing when it is not issued yet", async () => {
    const { screen } = await shown({ findDeferredSale: async () => FOUND_PENDING });

    await expect.element(screen.getByText("Factura C · Se asigna al emitir")).toBeVisible();
  });

  it("has Imprimir factura with the Enter key and the Esc key at the top right, and no Tab or F1", async () => {
    const { screen } = await shown();

    expect(keycapOf(screen.getByRole("button", { name: "Imprimir factura" }))).toBe("Enter");
    await expect.element(screen.getByRole("button", { name: "Cerrar con Esc" })).toBeVisible();
    await expect.element(screen.getByText("Tab", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("F1", { exact: true })).not.toBeInTheDocument();
  });

  it("prints the found sale's invoice from Imprimir factura and says it comes out once the printer is ready", async () => {
    const { screen, printDeferredSaleInvoice } = await shown();

    await userEvent.click(screen.getByRole("button", { name: "Imprimir factura" }));

    expect(printDeferredSaleInvoice).toHaveBeenCalledExactlyOnceWith("sale-1");
    await expect
      .element(screen.getByText("La factura sale en cuanto la impresora esté lista"))
      .toBeVisible();
    await expect.element(screen.getByText("Entregásela al cliente.")).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("prints the invoice when Enter is pressed", async () => {
    const { printDeferredSaleInvoice } = await shown();

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(printDeferredSaleInvoice).toHaveBeenCalledExactlyOnceWith("sale-1"),
    );
  });

  it.each([
    ["issuing the invoice of a pending sale", FOUND_PENDING, "Emitiendo la factura…"],
    ["printing the invoice already issued", FOUND_ISSUED, "Imprimiendo la factura…"],
  ] as const)(
    "shows it is %s while the core works, without letting it be asked again",
    async (_case, found, label) => {
      const answer = deferred<PrintDeferredSaleInvoiceOutcome>();
      const { screen, printDeferredSaleInvoice } = await shown({
        findDeferredSale: async () => found,
        printDeferredSaleInvoice: vi.fn(() => answer.promise),
      });

      await userEvent.keyboard("{Enter}");
      await userEvent.keyboard("{Enter}");

      const pending = screen.getByRole("button", { name: label });
      await expect.element(pending).toBeVisible();
      await expect.element(pending).toBeDisabled();
      expect(printDeferredSaleInvoice).toHaveBeenCalledOnce();
      answer.resolve({ kind: "started", copy: { kind: "original" } });
    },
  );

  it("stays on the screen on Esc and keeps its close disabled while the invoice is printing", async () => {
    const answer = deferred<PrintDeferredSaleInvoiceOutcome>();
    const { screen } = await shown({ printDeferredSaleInvoice: vi.fn(() => answer.promise) });
    const pathname = screen.router.state.location.pathname;
    await userEvent.keyboard("{Enter}");
    await expect
      .element(screen.getByRole("button", { name: "Imprimiendo la factura…" }))
      .toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("button", { name: "Cerrar con Esc" })).toBeDisabled();
    expect(screen.router.state.location.pathname).toBe(pathname);
    answer.resolve({ kind: "started", copy: { kind: "original" } });
    await expect
      .element(screen.getByText("La factura sale en cuanto la impresora esté lista"))
      .toBeVisible();
  });

  it("ignores a QR read while the invoice is printing, leaving the outcome on the sale it printed", async () => {
    const answer = deferred<PrintDeferredSaleInvoiceOutcome>();
    const { screen, findDeferredSale, readBarcode } = await shown({
      findDeferredSale: vi.fn(async () => FOUND_ISSUED),
      printDeferredSaleInvoice: vi.fn(() => answer.promise),
    });
    await userEvent.keyboard("{Enter}");
    await expect
      .element(screen.getByRole("button", { name: "Imprimiendo la factura…" }))
      .toBeVisible();

    readBarcode("purosur-deferred-sale:0198-def:3MN5R8TW");
    answer.resolve({ kind: "not_yet", cause: "cannot_authorize" });

    await expect.element(screen.getByText("Todavía no se puede facturar")).toBeVisible();
    await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
    expect(findDeferredSale).toHaveBeenCalledOnce();
  });

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
      "ARCA no autorizó la factura de esta venta y no se imprimió nada. La caja la vuelve a pedir sola: buscala de nuevo más tarde. Si vence el plazo sin autorizarse, queda como tarea para el dueño.",
    ],
  ] as const)(
    "says in the panel nothing was printed when it is not yet possible (%s), keeping the sale",
    async (cause, text) => {
      const { screen } = await shown({
        printDeferredSaleInvoice: async () => ({ kind: "not_yet", cause }),
      });

      await userEvent.click(screen.getByRole("button", { name: "Imprimir factura" }));

      await expect.element(screen.getByText("Todavía no se puede facturar")).toBeVisible();
      await expect.element(screen.getByText(text)).toBeVisible();
      await expect.element(screen.getByRole("button", { name: "Imprimir factura" })).toBeEnabled();
      await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
    },
  );

  it.each([
    ["already_printed"],
    ["voided"],
    ["sale_voided"],
    ["expired"],
    ["out_of_date_order"],
    ["not_found"],
  ] as const)("shows the refusal in the panel when printing answers %s", async (kind) => {
    const title = {
      already_printed: "La factura ya se imprimió",
      voided: "Esa venta se anuló",
      sale_voided: "Esa venta se anuló",
      expired: "Pasó el plazo para facturar esta venta",
      out_of_date_order: "Esta venta ya no se puede facturar",
      not_found: "No hay una venta diferida con ese código en esta caja",
    }[kind];
    const { screen } = await shown({
      findDeferredSale: vi
        .fn()
        .mockResolvedValueOnce(FOUND_ISSUED)
        .mockResolvedValue({ ...FOUND_ISSUED, original_printed: true }),
      printDeferredSaleInvoice: async () => ({ kind }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Imprimir factura" }));

    await expect.element(screen.getByText(title)).toBeVisible();
  });

  it("shows the printing notice and keeps the button when the core cannot print now", async () => {
    const { screen } = await shown({
      printDeferredSaleInvoice: async () => ({ kind: "printer_not_configured" }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Imprimir factura" }));

    await expect.element(screen.getByText("La impresora no está configurada")).toBeVisible();
    await expect.element(screen.getByText("Configurala para imprimir la factura.")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Imprimir factura" })).toBeEnabled();
  });

  it("says it could not print when the core does not answer", async () => {
    const { screen } = await shown({
      printDeferredSaleInvoice: async () => {
        throw new Error("core down");
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "Imprimir factura" }));

    await expect.element(screen.getByText("No se pudo imprimir la factura")).toBeVisible();
  });

  it("tells the app the session ended when printing finds nobody signed in", async () => {
    const { screen, onSessionInvalid } = await shown({
      printDeferredSaleInvoice: async () => ({ kind: "not_signed_in" }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Imprimir factura" }));

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });

  it("titles the panel with the receipt icon", async () => {
    const { screen } = await shown();

    const panel = screen.getByRole("complementary", { name: "Venta diferida" }).element();
    expect(panel.querySelector("svg.lucide-receipt")).not.toBeNull();
    expect(panel.querySelector("svg.lucide-file-text")).toBeNull();
  });

  it("goes back to the sale screen on Esc", async () => {
    const { screen } = await shown();

    await userEvent.keyboard("{Escape}");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it("goes back to the sale screen from the Esc key at the top right", async () => {
    const { screen } = await shown();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar con Esc" }));

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });
});
