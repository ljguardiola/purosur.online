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

const SEARCH = "Buscar venta";

describe("DeferredSaleScreen reading the customer's document", () => {
  it("invites the cashier to scan the document's QR or to type its code", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("heading", { name: "Escaneá el documento del cliente" }))
      .toBeVisible();
    await expect
      .element(screen.getByText("VENTA DIFERIDA · EL CLIENTE VOLVIÓ POR SU FACTURA"))
      .toBeVisible();
    await expect.element(screen.getByText("Acercá el QR del documento al lector")).toBeVisible();
    await expect
      .element(screen.getByText("Sirve el QR del documento no fiscal de una venta diferida."))
      .toBeVisible();
    await expect.element(screen.getByText("Lector listo")).toBeVisible();
    await expect.element(screen.getByText("SI EL LECTOR NO LEE EL QR")).toBeVisible();
    await expect
      .element(screen.getByText("Tipeá el código de consulta impreso en el documento"))
      .toBeVisible();
    await expect
      .element(screen.getByText("La factura sale como original, con la fecha de la venta."))
      .toBeVisible();
  });

  it("has no accessibility violations", async () => {
    await renderScreen();

    await expectNoAccessibilityViolations(document.body);
  });

  it("looks the sale up by the code as typed", async () => {
    const { screen, codeField, findDeferredSale } = await renderScreen();

    await userEvent.fill(codeField, "7kq4-m2p9");
    await userEvent.click(screen.getByRole("button", { name: SEARCH }));

    expect(findDeferredSale).toHaveBeenCalledExactlyOnceWith({ kind: "typed", code: "7kq4-m2p9" });
  });

  it("looks the sale up when Enter is pressed in the code field", async () => {
    const { codeField, findDeferredSale } = await renderScreen();

    await userEvent.fill(codeField, "7KQ4M2P9");
    await userEvent.keyboard("{Enter}");

    expect(findDeferredSale).toHaveBeenCalledExactlyOnceWith({ kind: "typed", code: "7KQ4M2P9" });
  });

  it("refuses a code that cannot be one, without asking the core", async () => {
    const { screen, codeField, findDeferredSale } = await renderScreen();

    await userEvent.fill(codeField, "7KQ4");
    await userEvent.click(screen.getByRole("button", { name: SEARCH }));

    await expect
      .element(screen.getByText("El código tiene 8 letras y números, como 7KQ4-M2P9."))
      .toBeVisible();
    expect(findDeferredSale).not.toHaveBeenCalled();
  });

  it("looks the sale up by the text of the QR the reader reads", async () => {
    const { findDeferredSale, readBarcode } = await renderScreen();

    readBarcode(QR_TEXT);

    await vi.waitFor(() =>
      expect(findDeferredSale).toHaveBeenCalledExactlyOnceWith({ kind: "scanned", text: QR_TEXT }),
    );
  });

  it("says a scanned code that is not a deferred sale's QR is not one, without asking the core", async () => {
    const { screen, findDeferredSale, readBarcode } = await renderScreen();

    readBarcode("7790001");

    await expect.element(screen.getByText("Ese QR no es de una venta diferida")).toBeVisible();
    await expect
      .element(
        screen.getByText("Escaneá el QR del documento no fiscal, o tipeá su código de consulta."),
      )
      .toBeVisible();
    expect(findDeferredSale).not.toHaveBeenCalled();
  });

  it.each([
    [
      { kind: "not_found" },
      "No hay una venta diferida con ese código en esta caja",
      "Revisá el código, o buscala en la caja donde se hizo la venta.",
    ],
    [{ kind: "voided" }, "Esa venta se anuló", "Una venta anulada no se factura."],
    [
      { kind: "expired" },
      "Pasó el plazo para facturar esta venta",
      "Quedó como tarea para el dueño.",
    ],
    [
      { ...FOUND_ISSUED, original_printed: true },
      "La factura ya se imprimió",
      "Si el cliente la perdió, reimprimí un duplicado desde el historial.",
    ],
    [
      { kind: "lacks_permission" },
      "No tenés permiso para facturar ventas diferidas",
      "Pedile a alguien con permiso que la facture.",
    ],
  ] as const satisfies readonly (readonly [FindDeferredSaleOutcome, string, string])[])(
    "tells what it found when the core answers %j",
    async (outcome, title, description) => {
      const { screen, codeField } = await renderScreen({ findDeferredSale: async () => outcome });

      await userEvent.fill(codeField, "7KQ4-M2P9");
      await userEvent.click(screen.getByRole("button", { name: SEARCH }));

      await expect.element(screen.getByText(title)).toBeVisible();
      await expect.element(screen.getByText(description)).toBeVisible();
      await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it("says it could not look the sale up when the core does not answer", async () => {
    const { screen, codeField } = await renderScreen({
      findDeferredSale: async () => {
        throw new Error("core down");
      },
    });

    await userEvent.fill(codeField, "7KQ4-M2P9");
    await userEvent.click(screen.getByRole("button", { name: SEARCH }));

    await expect.element(screen.getByText("No se pudo buscar la venta")).toBeVisible();
  });

  it("tells the app the session ended when the core says nobody is signed in", async () => {
    const { screen, codeField, onSessionInvalid } = await renderScreen({
      findDeferredSale: async () => ({ kind: "not_signed_in" }),
    });

    await userEvent.fill(codeField, "7KQ4-M2P9");
    await userEvent.click(screen.getByRole("button", { name: SEARCH }));

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });

  it("does not ask for the sale again while the first answer is awaited", async () => {
    const answer = deferred<FindDeferredSaleOutcome>();
    const { screen, codeField, findDeferredSale } = await renderScreen({
      findDeferredSale: vi.fn(() => answer.promise),
    });

    await userEvent.fill(codeField, "7KQ4-M2P9");
    await userEvent.click(screen.getByRole("button", { name: SEARCH }));
    await userEvent.keyboard("{Enter}");

    expect(findDeferredSale).toHaveBeenCalledOnce();
    answer.resolve({ kind: "not_found" });
  });

  it("clears the previous refusal when a new code is typed", async () => {
    const { screen, codeField } = await renderScreen({
      findDeferredSale: async () => ({ kind: "voided" }),
    });
    await userEvent.fill(codeField, "7KQ4-M2P9");
    await userEvent.click(screen.getByRole("button", { name: SEARCH }));
    await expect.element(screen.getByText("Esa venta se anuló")).toBeVisible();

    await userEvent.fill(codeField, "7KQ4-M2P8");

    await expect.element(screen.getByText("Esa venta se anuló")).not.toBeInTheDocument();
  });
});

describe("DeferredSaleScreen invoicing the sale it found", () => {
  async function findAndOpen(overrides: Parameters<typeof renderScreen>[0] = {}) {
    const rendered = await renderScreen({
      findDeferredSale: async () => FOUND_ISSUED,
      ...overrides,
    });
    await userEvent.fill(rendered.codeField, "7KQ4-M2P9");
    await userEvent.click(rendered.screen.getByRole("button", { name: SEARCH }));
    await expect
      .element(rendered.screen.getByRole("dialog", { name: "Imprimí la factura" }))
      .toBeVisible();
    return rendered;
  }

  it("opens the window to print the invoice with the sale it found", async () => {
    const { screen } = await findAndOpen();

    const dialog = screen.getByRole("dialog");
    await expect.element(dialog.getByText("$ 3.299,99")).toBeVisible();
    await expect.element(dialog.getByText(/Nº 00001250/)).toBeVisible();
    await expect.element(dialog.getByText("16/09/2026 · 10:20")).toBeVisible();
  });

  it("opens the window for a sale whose invoice is not issued yet", async () => {
    const { screen } = await findAndOpen({ findDeferredSale: async () => FOUND_PENDING });

    await expect.element(screen.getByText("Se asigna al emitir")).toBeVisible();
  });

  it("opens the window after the reader scans the QR", async () => {
    const { screen, readBarcode } = await renderScreen({
      findDeferredSale: async () => FOUND_ISSUED,
    });

    readBarcode(QR_TEXT);

    await expect.element(screen.getByRole("dialog", { name: "Imprimí la factura" })).toBeVisible();
  });

  it("prints the found sale's invoice, closes the window and says it came out as an original", async () => {
    const { screen, printDeferredSaleInvoice } = await findAndOpen();

    await userEvent.click(screen.getByRole("button", { name: "Imprimir la factura" }));

    expect(printDeferredSaleInvoice).toHaveBeenCalledExactlyOnceWith("sale-1");
    await expect.element(screen.getByText("La factura salió como original")).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the window and shows the refusal when the core says the sale was voided meanwhile", async () => {
    const { screen } = await findAndOpen({
      printDeferredSaleInvoice: async () => ({ kind: "voided" }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Imprimir la factura" }));

    await expect.element(screen.getByText("Esa venta se anuló")).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("tells the app the session ended when printing finds nobody signed in", async () => {
    const { screen, onSessionInvalid } = await findAndOpen({
      printDeferredSaleInvoice: async () => ({ kind: "not_signed_in" }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Imprimir la factura" }));

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });

  it("closes the window from Volver and leaves the code field ready", async () => {
    const { screen, codeField } = await findAndOpen();

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(codeField).toBeVisible();
  });
});
