import type { CompleteReturnOutcome } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import type { RenderedScreen } from "./test-support/return-screen";
import {
  chooseReturnLine,
  legendOf,
  lineRow,
  lookUp,
  openReturn,
  QR_TEXT,
  renderScreen,
  searchBox,
  statusText,
} from "./test-support/return-screen";

function verifiedTicket(screen: RenderedScreen) {
  return screen.getByRole("checkbox", { name: "Ticket verificado" });
}

async function decideOnePasta(screen: RenderedScreen) {
  await openReturn(screen);
  await chooseReturnLine(screen, "Pasta de maní 380 g");
  await userEvent.keyboard("t");
  await expect.element(screen.getByRole("button", { name: "Completar devolución" })).toBeEnabled();
}

async function complete() {
  await userEvent.keyboard("{Enter}");
}

describe("ReturnScreen verifying the ticket", () => {
  it("shows the Ticket verificado card with T, unchecked, for a typed ticket, and blocks completing until it is checked", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);

    await chooseReturnLine(screen, "Pasta de maní 380 g");

    await expect.element(verifiedTicket(screen)).not.toBeChecked();
    await expect
      .element(
        screen
          .getByRole("complementary", { name: "Resumen de la devolución" })
          .getByText("T", { exact: true }),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeDisabled();
  });

  it("checks and unchecks it with T, and with a click", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);
    await chooseReturnLine(screen, "Pasta de maní 380 g");

    await userEvent.keyboard("t");
    await expect.element(verifiedTicket(screen)).toBeChecked();
    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeEnabled();
    await userEvent.keyboard("t");
    await expect.element(verifiedTicket(screen)).not.toBeChecked();
    await verifiedTicket(screen).click({ force: true });
    await expect.element(verifiedTicket(screen)).toBeChecked();
  });

  it("does not complete on Enter while the ticket is not verified", async () => {
    const { screen, completeReturn } = await renderScreen();
    await openReturn(screen);
    await chooseReturnLine(screen, "Pasta de maní 380 g");

    await userEvent.keyboard("{Enter}");

    expect(completeReturn).not.toHaveBeenCalled();
  });

  it("keeps offering T in the footer while the card is unchecked, and Enter Completar only once it is checked", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);
    await chooseReturnLine(screen, "Pasta de maní 380 g");

    expect(legendOf(screen)).toEqual(["↑↓Líneas", "EspacioMarcar", "F6Editar", "TVerificar"]);
    await userEvent.keyboard("t");

    expect(legendOf(screen)).toEqual([
      "↑↓Líneas",
      "EspacioMarcar",
      "F6Editar",
      "TVerificar",
      "EnterCompletar",
    ]);
  });

  it("asks the core to complete with the card's state", async () => {
    const { screen, completeReturn } = await renderScreen();
    await decideOnePasta(screen);

    await complete();

    expect(completeReturn).toHaveBeenCalledWith(expect.objectContaining({ ticketVerified: true }));
  });

  it("shows an amber notice when the core says the ticket was not verified", async () => {
    const { screen } = await renderScreen({
      completeReturn: async () => ({ kind: "ticket_not_verified" }),
    });
    await decideOnePasta(screen);

    await complete();

    await expect
      .element(statusText(screen, "Marcá Ticket verificado para completar la devolución."))
      .toBeVisible();
  });

  it("shows no confirmation modal asking whether the ticket matches the paper one", async () => {
    const { screen } = await renderScreen();

    await openReturn(screen);

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect
      .element(screen.getByText("¿Coincide con el ticket en papel?"))
      .not.toBeInTheDocument();
  });
});

describe("ReturnScreen completing the return", () => {
  it("completes with the lines, the whole refund in the only payment and how the sale was found", async () => {
    const { screen, completeReturn } = await renderScreen();
    await decideOnePasta(screen);

    await complete();

    expect(completeReturn).toHaveBeenCalledExactlyOnceWith({
      saleId: "sale-1",
      ticketSource: "TYPED",
      ticketVerified: true,
      lines: [
        {
          sale_line_id: "line-pasta",
          quantity: 3,
          reason: "change_of_mind",
          disposition: "restock",
          resolution: "refund",
        },
      ],
      refunds: [{ payment_id: "pay-cash", amount: 970_000 }],
      authorization: undefined,
    });
  });

  it("completes with the Completar devolución button too", async () => {
    const { screen, completeReturn } = await renderScreen();
    await decideOnePasta(screen);

    await userEvent.click(screen.getByRole("button", { name: "Completar devolución" }));

    expect(completeReturn).toHaveBeenCalledOnce();
  });

  it("records a ticket the reader scanned as scanned", async () => {
    const { screen, completeReturn, readBarcode } = await renderScreen();
    readBarcode(QR_TEXT);
    await expect.element(lineRow(screen, "Pasta de maní 380 g")).toBeVisible();
    await chooseReturnLine(screen, "Pasta de maní 380 g");
    await userEvent.keyboard("t");

    await complete();

    expect(completeReturn).toHaveBeenCalledWith(expect.objectContaining({ ticketSource: "QR" }));
  });

  it("records a sale chosen from Historial as such, completing without verifying any ticket", async () => {
    const { screen, completeReturn } = await renderScreen({ saleId: "sale-1" });
    await expect.element(lineRow(screen, "Pasta de maní 380 g")).toBeVisible();
    await chooseReturnLine(screen, "Pasta de maní 380 g");

    await complete();

    expect(completeReturn).toHaveBeenCalledWith(
      expect.objectContaining({ ticketSource: "HISTORY", ticketVerified: false }),
    );
  });

  it("completes the exchange of a defective line without refunding any payment, and tells to hand over the exchanged units", async () => {
    const completeReturn = vi.fn(
      async (): Promise<CompleteReturnOutcome> => ({
        kind: "completed",
        return_id: "return-1",
        refunded_in_cash: 0,
        refunds: [],
        authorized_by: null,
      }),
    );
    const { screen } = await renderScreen({
      completeReturn,
      previewReturn: async (_saleId, lines) => ({
        kind: "previewed",
        lines: lines.map((line) => ({ ...line, refusal: null, refund_amount: 0 })),
        refundable_total: 0,
      }),
    });
    await openReturn(screen);
    await chooseReturnLine(screen, "Pasta de maní 380 g", {
      reason: "Defecto",
      disposition: "Descarte",
      resolution: "Cambio",
    });
    await userEvent.keyboard("t");

    await complete();

    expect(completeReturn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        lines: [
          {
            sale_line_id: "line-pasta",
            quantity: 3,
            reason: "defective",
            disposition: "discard",
            resolution: "exchange",
          },
        ],
        refunds: [],
      }),
    );
    await expect
      .element(screen.getByRole("heading", { name: "Entregá el cambio al cliente" }))
      .toBeVisible();
    await expect.element(screen.getByText("Entregá 3 u en cambio · se descarta")).toBeVisible();
  });

  it("tells the cashier to hand over the money, and starts a new return when done", async () => {
    const { screen } = await renderScreen();
    await decideOnePasta(screen);

    await complete();

    await expect
      .element(screen.getByRole("heading", { name: "Entregá el dinero al cliente" }))
      .toBeVisible();
    await expect.element(screen.getByText("Pasta de maní 380 g · 3 u")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Listo" }));
    await expect.element(searchBox(screen)).toHaveValue("");
    await expect.element(screen.getByText("Sin ventas")).toBeVisible();
  });

  it("does not complete twice while the first answer is awaited", async () => {
    const answer = deferred<CompleteReturnOutcome>();
    const { screen, completeReturn } = await renderScreen({
      completeReturn: vi.fn(() => answer.promise),
    });
    await decideOnePasta(screen);

    await complete();
    await complete();

    expect(completeReturn).toHaveBeenCalledOnce();
    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeDisabled();
  });

  it("does not leave with Esc while the return is being completed", async () => {
    const answer = deferred<CompleteReturnOutcome>();
    const { screen } = await renderScreen({ completeReturn: vi.fn(() => answer.promise) });
    await decideOnePasta(screen);
    await complete();

    await userEvent.keyboard("{Escape}");

    await expect.element(lineRow(screen, "Pasta de maní 380 g")).toBeVisible();
  });

  it("keeps the return being completed when the cashier types in the search, and tells to hand over the money", async () => {
    const answer = deferred<CompleteReturnOutcome>();
    const { screen } = await renderScreen({ completeReturn: vi.fn(() => answer.promise) });
    await decideOnePasta(screen);
    await complete();

    searchBox(screen).element().focus();
    await userEvent.keyboard("5");
    answer.resolve({
      kind: "completed",
      return_id: "return-1",
      refunded_in_cash: 970_000,
      refunds: [
        {
          payment_id: "pay-cash",
          method: "CASH",
          amount: 970_000,
          state: "APPROVED",
          sent_by_cloud: false,
        },
      ],
      authorized_by: null,
    });

    await expect
      .element(screen.getByRole("heading", { name: "Entregá el dinero al cliente" }))
      .toBeVisible();
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
    [{ kind: "unavailable" }, "No se pudo completar la devolución. Probá de nuevo."],
  ] as const)(
    "shows an amber notice with the reason the core refused with %j, keeping what was chosen and Completar enabled",
    async (outcome, text) => {
      const { screen } = await renderScreen({ completeReturn: async () => outcome });
      await decideOnePasta(screen);

      await complete();

      await expect.element(statusText(screen, text)).toBeVisible();
      await expect
        .element(screen.getByRole("checkbox", { name: /Pasta de maní 380 g/ }))
        .toBeChecked();
      await expect
        .element(screen.getByRole("button", { name: "Completar devolución" }))
        .toBeEnabled();
    },
  );

  it("shows the amber notice of a sale that can no longer be returned over the summary of the same sale", async () => {
    const { screen } = await renderScreen({
      completeReturn: async () => ({ kind: "sale_not_returnable" }),
    });
    await openReturn(screen);
    await chooseReturnLine(screen, "Pasta de maní 380 g");
    await chooseReturnLine(screen, "Nibs de cacao");
    await userEvent.keyboard("t");

    await complete();

    const panel = screen.getByRole("complementary", { name: "Resumen de la devolución" });
    await expect.element(statusText(screen, "Esa venta ya no se puede devolver.")).toBeVisible();
    await expect.poll(() => panel.element().textContent).toMatch(/A REINTEGRAR\s*\$\s*13\.935,00/);
    await expect.element(panel.getByText("Factura C")).toBeVisible();
  });

  it("says it could not complete when the core does not answer", async () => {
    const { screen } = await renderScreen({
      completeReturn: async () => {
        throw new Error("core down");
      },
    });
    await decideOnePasta(screen);

    await complete();

    await expect
      .element(statusText(screen, "No se pudo completar la devolución. Probá de nuevo."))
      .toBeVisible();
  });

  it("tells the app the session ended when the core says nobody is signed in", async () => {
    const { screen, onSessionInvalid } = await renderScreen({
      completeReturn: async () => ({ kind: "not_signed_in" }),
    });
    await decideOnePasta(screen);

    await complete();

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });

  it("looks a new ticket up again from the empty search after a return", async () => {
    const { screen, findSaleForReturn } = await renderScreen();
    await decideOnePasta(screen);
    await complete();
    await userEvent.click(screen.getByRole("button", { name: "Listo" }));

    await lookUp(screen, "0003-00001193");

    expect(findSaleForReturn).toHaveBeenLastCalledWith(
      { kind: "typed", point_of_sale: 3, number: 1193 },
      undefined,
    );
  });
});
