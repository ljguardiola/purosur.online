import type { CompleteReturnOutcome } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import type { RenderedScreen } from "./test-support/return-screen";
import { chooseReturnLine, openReturn, QR_TEXT, renderScreen } from "./test-support/return-screen";

async function decideOnePasta(screen: RenderedScreen) {
  await openReturn(screen);
  await chooseReturnLine(screen, "Pasta de maní 380 g", {
    reason: "Arrepentimiento",
    disposition: "A la venta",
  });
  await expect.element(screen.getByRole("button", { name: "Completar devolución" })).toBeEnabled();
}

async function complete(screen: RenderedScreen) {
  await userEvent.click(screen.getByRole("button", { name: "Completar devolución" }));
}

describe("ReturnScreen completing the return", () => {
  it("completes the return with the lines, the refund and how the sale was found", async () => {
    const { screen, completeReturn } = await renderScreen();
    await decideOnePasta(screen);

    await complete(screen);

    expect(completeReturn).toHaveBeenCalledExactlyOnceWith({
      saleId: "sale-1",
      ticketSource: "TYPED",
      lines: [
        {
          sale_line_id: "line-pasta",
          quantity: 3,
          reason: "change_of_mind",
          disposition: "restock",
        },
      ],
      refunds: [{ payment_id: "pay-cash", amount: 970_000 }],
      authorization: undefined,
    });
  });

  it("records a ticket the reader scanned as scanned", async () => {
    const { screen, completeReturn, readBarcode } = await renderScreen();
    readBarcode(QR_TEXT);
    await userEvent.click(screen.getByRole("button", { name: "Coincide: seguir" }));
    await chooseReturnLine(screen, "Pasta de maní 380 g", {
      reason: "Defecto",
      disposition: "Descarte",
    });
    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeEnabled();

    await complete(screen);

    expect(completeReturn).toHaveBeenCalledWith(expect.objectContaining({ ticketSource: "QR" }));
  });

  it("refunds the amount the cashier types in the payment", async () => {
    const { screen, completeReturn } = await renderScreen();
    await decideOnePasta(screen);

    await userEvent.fill(
      screen.getByRole("textbox", { name: "Reintegro por Efectivo" }),
      "5.000,00",
    );
    await complete(screen);

    expect(completeReturn).toHaveBeenCalledWith(
      expect.objectContaining({ refunds: [{ payment_id: "pay-cash", amount: 500_000 }] }),
    );
  });

  it("tells the cashier to hand over the money, and starts a new return when done", async () => {
    const { screen } = await renderScreen();
    await decideOnePasta(screen);

    await complete(screen);

    await expect
      .element(screen.getByRole("heading", { name: "Entregá el dinero al cliente" }))
      .toBeVisible();
    await expect.element(screen.getByText("Pasta de maní 380 g · 3 u")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Listo" }));
    await expect
      .element(screen.getByRole("heading", { name: "Escaneá el ticket del cliente" }))
      .toBeVisible();
  });

  it("does not complete twice while the first answer is awaited", async () => {
    const answer = deferred<CompleteReturnOutcome>();
    const { screen, completeReturn } = await renderScreen({
      completeReturn: vi.fn(() => answer.promise),
    });
    await decideOnePasta(screen);

    await complete(screen);

    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeDisabled();
    expect(completeReturn).toHaveBeenCalledOnce();
  });

  it.each([
    [{ kind: "not_found" }, "Esa venta ya no se puede devolver."],
    [{ kind: "sale_not_returnable" }, "Esa venta ya no se puede devolver."],
    [{ kind: "no_open_session" }, "No hay una caja abierta para entregar el dinero."],
    [{ kind: "no_lines" }, "Elegí al menos una línea para devolver."],
    [
      {
        kind: "line_refused",
        sale_line_id: "line-pasta",
        refusal: { kind: "quantity_exceeds_returnable", returnable: 1 },
      },
      "Pasta de maní 380 g: se pueden devolver hasta 1 u.",
    ],
    [
      {
        kind: "refund_refused",
        refusal: { kind: "exceeds_payment", payment_id: "pay-cash", remaining: 100_000 },
      },
      "El pago solo permite reintegrar $ 1.000,00.",
    ],
    [{ kind: "unavailable" }, "No se pudo completar la devolución. Probá de nuevo."],
  ] as const)(
    "says why the core refused with %j and keeps what was chosen",
    async (outcome, text) => {
      const { screen } = await renderScreen({ completeReturn: async () => outcome });
      await decideOnePasta(screen);

      await complete(screen);

      await expect.element(screen.getByText(text).first().first()).toBeVisible();
      await expect
        .element(screen.getByRole("checkbox", { name: /Pasta de maní 380 g/ }))
        .toBeChecked();
      await expect
        .element(screen.getByRole("button", { name: "Completar devolución" }))
        .toBeEnabled();
    },
  );

  it("says it could not complete when the core does not answer", async () => {
    const { screen } = await renderScreen({
      completeReturn: async () => {
        throw new Error("core down");
      },
    });
    await decideOnePasta(screen);

    await complete(screen);

    await expect
      .element(screen.getByText("No se pudo completar la devolución. Probá de nuevo."))
      .toBeVisible();
  });

  it("tells the app the session ended when the core says nobody is signed in", async () => {
    const { screen, onSessionInvalid } = await renderScreen({
      completeReturn: async () => ({ kind: "not_signed_in" }),
    });
    await decideOnePasta(screen);

    await complete(screen);

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });
});
