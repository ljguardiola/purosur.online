import type { FindSaleForReturnOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import { QR_TEXT, renderScreen, typeTicket } from "./test-support/return-screen";

describe("ReturnScreen asking for the customer's ticket", () => {
  it("invites the cashier to scan the ticket's QR or to type its numbers", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("heading", { name: "Escaneá el ticket del cliente" }))
      .toBeVisible();
    await expect.element(screen.getByText("DEVOLUCIÓN · SOLO CON TICKET")).toBeVisible();
    await expect.element(screen.getByText("Acercá el QR del ticket al lector")).toBeVisible();
    await expect
      .element(
        screen.getByText("Sirve el QR de la factura C o el del documento de una venta diferida."),
      )
      .toBeVisible();
    await expect.element(screen.getByText("SI EL LECTOR NO LEE EL QR")).toBeVisible();
    await expect.element(screen.getByText("Tipeá los datos impresos en el ticket")).toBeVisible();
    await expect
      .element(screen.getByText("Sin ticket no se puede devolver."))
      .not.toBeInTheDocument();
  });

  it("offers no search by date, amount or product", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox").elements()).toHaveLength(2);
  });

  it("offers the return in the register's menu, as the current screen", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("link", { name: "Devolver" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("has no accessibility violations", async () => {
    await renderScreen();

    await expectNoAccessibilityViolations(document.body);
  });

  it("looks the sale up by the QR the reader scans, and asks to confirm it against the paper", async () => {
    const { screen, findSaleForReturn, readBarcode } = await renderScreen();

    readBarcode(QR_TEXT);

    await vi.waitFor(() =>
      expect(findSaleForReturn).toHaveBeenCalledExactlyOnceWith(
        { kind: "scanned", text: QR_TEXT },
        undefined,
      ),
    );
    await expect
      .element(screen.getByRole("heading", { name: "¿Coincide con el ticket en papel?" }))
      .toBeVisible();
  });

  it("looks the sale up by the numbers typed, and shows its date and total to confirm", async () => {
    const { screen, findSaleForReturn } = await renderScreen();

    await typeTicket(screen);

    expect(findSaleForReturn).toHaveBeenCalledExactlyOnceWith(
      { kind: "typed", point_of_sale: 3, number: 1192 },
      undefined,
    );
    await expect.element(screen.getByText("12/09/2026 · 11:42")).toBeVisible();
    await expect.element(screen.getByText("$ 25.335,00")).toBeVisible();
  });

  it("looks the sale up when Enter is pressed in a field", async () => {
    const { screen, findSaleForReturn } = await renderScreen();

    await userEvent.fill(screen.getByRole("textbox", { name: "Punto de venta" }), "3");
    await userEvent.fill(screen.getByRole("textbox", { name: "Número de comprobante" }), "1192");
    await userEvent.keyboard("{Enter}");

    expect(findSaleForReturn).toHaveBeenCalledOnce();
  });

  it("refuses numbers that cannot be a ticket's, without asking the core", async () => {
    const { screen, findSaleForReturn } = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Buscar venta" }));

    await expect
      .element(screen.getByText("Tipeá el punto de venta impreso, como 00003."))
      .toBeVisible();
    await expect
      .element(screen.getByText("Tipeá el número de comprobante impreso, como 00001192."))
      .toBeVisible();
    expect(findSaleForReturn).not.toHaveBeenCalled();
  });

  it("says a scanned code that is not a ticket's QR is not one, without asking the core", async () => {
    const { screen, findSaleForReturn, readBarcode } = await renderScreen();

    readBarcode("7790001");

    await expect.element(screen.getByText("Ese QR no es de un ticket").first()).toBeVisible();
    expect(findSaleForReturn).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "not_found" }, "No encontramos esa venta en esta sucursal."],
    [
      { kind: "needs_connection" },
      "Se necesita conexión a internet para buscar una venta de otra caja.",
    ],
    [{ kind: "voided" }, "Esa venta está anulada: no se puede devolver."],
    [{ kind: "unavailable" }, "No se pudo buscar la venta"],
  ] as const)(
    "tells the refusal %j the core answers, without opening the return",
    async (outcome, text) => {
      const { screen } = await renderScreen({ findSaleForReturn: async () => outcome });

      await typeTicket(screen);

      await expect.element(screen.getByText(text).first().first()).toBeVisible();
      await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it("says it could not look the sale up when the core does not answer", async () => {
    const { screen } = await renderScreen({
      findSaleForReturn: async () => {
        throw new Error("core down");
      },
    });

    await typeTicket(screen);

    await expect.element(screen.getByText("No se pudo buscar la venta").first()).toBeVisible();
  });

  it("tells the app the session ended when the core says nobody is signed in", async () => {
    const { screen, onSessionInvalid } = await renderScreen({
      findSaleForReturn: async () => ({ kind: "not_signed_in" }),
    });

    await typeTicket(screen);

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });

  it("does not ask for the sale again while the first answer is awaited", async () => {
    const answer = deferred<FindSaleForReturnOutcome>();
    const { screen, findSaleForReturn, readBarcode } = await renderScreen({
      findSaleForReturn: vi.fn(() => answer.promise),
    });

    await typeTicket(screen);
    readBarcode(QR_TEXT);

    expect(findSaleForReturn).toHaveBeenCalledOnce();
  });

  it("goes back to asking for the ticket when the sale does not match the paper", async () => {
    const { screen, previewReturn, completeReturn } = await renderScreen();
    await typeTicket(screen);

    await userEvent.click(screen.getByRole("button", { name: "No coincide" }));

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("heading", { name: "Escaneá el ticket del cliente" }))
      .toBeVisible();
    expect(previewReturn).not.toHaveBeenCalled();
    expect(completeReturn).not.toHaveBeenCalled();
  });

  it("goes on to choose what the customer returns when the sale matches the paper", async () => {
    const { screen } = await renderScreen();
    await typeTicket(screen);

    await userEvent.click(screen.getByRole("button", { name: "Coincide: seguir" }));

    await expect
      .element(screen.getByRole("heading", { name: "Elegí qué devuelve el cliente" }))
      .toBeVisible();
  });
});
