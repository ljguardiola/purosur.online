import type { FindDeferredSaleOutcome } from "@purosur/contracts";
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

  it("says a scanned code that is not a deferred sale's QR is not one, without asking the core", async () => {
    const { screen, findDeferredSale, readBarcode } = await renderScreen();

    readBarcode("7790001");

    await expect.element(screen.getByText("Ese QR no es de una venta diferida")).toBeVisible();
    await expect
      .element(screen.getByText("Escaneá el QR del documento no fiscal."))
      .toBeVisible();
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

  it("lists the sale's lines locked, with each one's price, quantity and amount", async () => {
    const { screen } = await shown();

    const table = screen.getByRole("table", { name: "Líneas de la venta" });
    for (const header of ["PRODUCTO", "PRECIO", "CANTIDAD", "IMPORTE"]) {
      await expect.element(table.getByText(header, { exact: true })).toBeVisible();
    }
    await expect.element(table.getByRole("img", { name: "Líneas bloqueadas" })).toBeVisible();
    await expect.element(table.getByText("Almendras peladas")).toBeVisible();
    await expect.element(table.getByText("$ 18.900,00 / kg")).toBeVisible();
    await expect.element(table.getByText("0,500 kg")).toBeVisible();
    await expect.element(table.getByText("$ 9.450,00")).toBeVisible();
    await expect.element(table.getByText("Yerba mate orgánica 1 kg")).toBeVisible();
    await expect.element(table.getByText("$ 6.950,00 / u")).toBeVisible();
    await expect.element(table.getByText("1 u")).toBeVisible();
    await expect.element(table.getByText("$ 6.950,00", { exact: true }).last()).toBeVisible();
  });

  it("leaves no line selectable", async () => {
    const { screen } = await shown();

    await userEvent.click(screen.getByText("Almendras peladas"));

    await expect
      .element(screen.getByRole("row", { name: /Almendras peladas/ }))
      .not.toHaveAttribute("aria-current");
  });

  it("shows the total, the sale's time, the comprobante and the item count the core answered", async () => {
    const { screen } = await shown({ findDeferredSale: async () => ({ ...FOUND_ISSUED, item_count: 3 }) });

    const panel = screen.getByRole("complementary", { name: "Venta diferida" });
    await expect.element(panel.getByText("TOTAL")).toBeVisible();
    await expect.element(panel.getByText("$ 16.400,00")).toBeVisible();
    await expect.element(panel.getByText("Venta del")).toBeVisible();
    await expect.element(panel.getByText("04/11 · 14:02")).toBeVisible();
    await expect.element(panel.getByText("Comprobante")).toBeVisible();
    await expect.element(panel.getByText("Factura C · 0003-00000187")).toBeVisible();
    await expect.element(panel.getByText("Artículos")).toBeVisible();
    await expect.element(panel.getByText("3", { exact: true })).toBeVisible();
  });

  it("says the invoice is assigned on issuing when it is not issued yet", async () => {
    const { screen } = await shown({ findDeferredSale: async () => FOUND_PENDING });

    await expect
      .element(screen.getByText("Factura C · Se asigna al emitir"))
      .toBeVisible();
  });

  it("has Imprimir factura with the Enter key and the Esc key at the top right, and no Tab or F1", async () => {
    const { screen } = await shown();

    expect(keycapOf(screen.getByRole("button", { name: "Imprimir factura" }))).toBe("Enter");
    await expect.element(screen.getByRole("button", { name: "Cerrar con Esc" })).toBeVisible();
    await expect.element(screen.getByText("Tab", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("F1", { exact: true })).not.toBeInTheDocument();
  });

  it("opens the window to print the invoice from Imprimir factura", async () => {
    const { screen } = await shown();

    await userEvent.click(screen.getByRole("button", { name: "Imprimir factura" }));

    const dialog = screen.getByRole("dialog", { name: "Imprimí la factura" });
    await expect.element(dialog.getByText("$ 16.400,00")).toBeVisible();
    await expect.element(dialog.getByText(/Nº 00000187/)).toBeVisible();
    await expect.element(dialog.getByText("04/11/2026 · 14:02")).toBeVisible();
  });

  it("opens the window to print the invoice when Enter is pressed", async () => {
    const { screen } = await shown();

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByRole("dialog", { name: "Imprimí la factura" })).toBeVisible();
  });

  it("opens the window for a sale whose invoice is not issued yet", async () => {
    const { screen } = await shown({ findDeferredSale: async () => FOUND_PENDING });

    await userEvent.click(screen.getByRole("button", { name: "Imprimir factura" }));

    await expect
      .element(screen.getByRole("dialog").getByText("Se asigna al emitir"))
      .toBeVisible();
  });

  it("prints the found sale's invoice, closes the window and says it comes out once the printer is ready", async () => {
    const { screen, printDeferredSaleInvoice } = await shown();
    await userEvent.click(screen.getByRole("button", { name: "Imprimir factura" }));

    await userEvent.click(screen.getByRole("button", { name: "Imprimir la factura" }));

    expect(printDeferredSaleInvoice).toHaveBeenCalledExactlyOnceWith("sale-1");
    await expect
      .element(screen.getByText("La factura sale en cuanto la impresora esté lista"))
      .toBeVisible();
    await expect.element(screen.getByText("Entregásela al cliente.")).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the window and shows the refusal when the core says the sale was voided meanwhile", async () => {
    const { screen } = await shown({
      printDeferredSaleInvoice: async () => ({ kind: "voided" }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Imprimir factura" }));

    await userEvent.click(screen.getByRole("button", { name: "Imprimir la factura" }));

    await expect.element(screen.getByText("Esa venta se anuló")).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("tells the app the session ended when printing finds nobody signed in", async () => {
    const { screen, onSessionInvalid } = await shown({
      printDeferredSaleInvoice: async () => ({ kind: "not_signed_in" }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Imprimir factura" }));

    await userEvent.click(screen.getByRole("button", { name: "Imprimir la factura" }));

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });

  it("closes the window from Volver and keeps the sale shown", async () => {
    const { screen } = await shown();
    await userEvent.click(screen.getByRole("button", { name: "Imprimir factura" }));

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
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
