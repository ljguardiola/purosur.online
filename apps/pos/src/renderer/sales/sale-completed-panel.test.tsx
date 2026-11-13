import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { backupTickets } from "../shell/test-support/contingency-backup-tickets";
import type { BackupStanding, Comprobante, Overrides } from "./test-support/sale-completed-panel";
import {
  CASH,
  expectAlertText,
  found,
  renderPanel,
  ticketOf,
} from "./test-support/sale-completed-panel";

afterEach(() => {
  vi.useRealTimers();
});

describe("SaleCompletedPanel", () => {
  it("titles the panel Venta completada and shows the change as the main figure", async () => {
    const { screen } = await renderPanel(CASH);

    await expect
      .element(screen.getByRole("complementary", { name: "Venta completada" }))
      .toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "Venta completada" })).toBeVisible();
    await expect.element(screen.getByText("VUELTO", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 240,00")).toBeVisible();
    await expect.element(screen.getByText("Vuelto a entregar")).not.toBeInTheDocument();
    await expect.element(screen.getByText("VENTA COMPLETADA")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the total and what the customer handed over in cash", async () => {
    const { screen } = await renderPanel(CASH);

    await expect.element(screen.getByText("Total", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
    await expect.element(screen.getByText("Efectivo", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 5.000,00")).toBeVisible();
    await expect.element(screen.getByText("Efectivo entregado")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Redondeo")).not.toBeInTheDocument();
  });

  it("shows the cash rounding between the total and the cash handed over", async () => {
    const { screen } = await renderPanel({
      total: 2_519_250,
      tendered: 3_000_000,
      change: 490_000,
      cashRounding: 9_250,
    });

    await expect.element(screen.getByText("$ 49.000,00")).not.toBeInTheDocument();
    await expect.element(screen.getByText("$ 4.900,00")).toBeVisible();
    await expect.element(screen.getByText("$ 25.192,50")).toBeVisible();
    await expect.element(screen.getByText("Redondeo")).toBeVisible();
    await expect.element(screen.getByText("– $ 92,50")).toBeVisible();
    await expect.element(screen.getByText("$ 30.000,00")).toBeVisible();
  });

  it("leaves the change figure out when the payment was exact", async () => {
    const { screen } = await renderPanel({
      total: 476_000,
      tendered: 476_000,
      change: 0,
      cashRounding: 0,
    });

    await expect.element(screen.getByRole("heading", { name: "Venta completada" })).toBeVisible();
    await expect.element(screen.getByText("VUELTO", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("Efectivo", { exact: true })).toBeVisible();
  });

  it("shows the total charged by transfer, with no change", async () => {
    const { screen } = await renderPanel({ total: 476_000, method: "TRANSFER", amount: 476_000 });

    await expect.element(screen.getByRole("heading", { name: "Venta completada" })).toBeVisible();
    await expect.element(screen.getByText("Total", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Transferencia", { exact: true })).toBeVisible();
    expect(screen.getByText("$ 4.760,00").elements()).toHaveLength(2);
    await expect.element(screen.getByText("VUELTO", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("Redondeo")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows only what the last transfer charged when it paid part of the sale", async () => {
    const { screen } = await renderPanel({ total: 476_000, method: "TRANSFER", amount: 300_000 });

    await expect.element(screen.getByText("Transferencia", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 3.000,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
  });

  it("shows what the Mercado Pago QR charged, with no change", async () => {
    const { screen } = await renderPanel({ total: 476_000, method: "QR", amount: 300_000 });

    await expect.element(screen.getByText("QR de Mercado Pago", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 3.000,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
    await expect.element(screen.getByText("VUELTO", { exact: true })).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("tells the surplus of a paid order is a pending refund the cloud sends once confirmed in the backoffice, with no change", async () => {
    const { screen } = await renderPanel({
      total: 476_000,
      method: "QR",
      amount: 500_000,
      surplusRefund: { amount: 24_000, sentByCloud: true },
    });

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent(
        "Reembolso pendiente de $ 240,00 por Mercado Pago La nube lo envía a Mercado Pago cuando alguien lo confirma en el backoffice.",
      );
    await expect.element(screen.getByText("VUELTO", { exact: true })).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("tells the surplus of a paid order is a pending refund a person makes from Mercado Pago when the cloud does not send it", async () => {
    const { screen } = await renderPanel({
      total: 476_000,
      method: "POINT",
      cardType: null,
      amount: 500_000,
      surplusRefund: { amount: 24_000, sentByCloud: false },
    });

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent(
        "Reembolso pendiente de $ 240,00 por Mercado Pago Lo devuelve una persona desde Mercado Pago, cuando lo atiende en el backoffice.",
      );
  });

  it("says nothing of a surplus when the paid order had none", async () => {
    const { screen } = await renderPanel({
      total: 476_000,
      method: "QR",
      amount: 476_000,
      surplusRefund: { amount: 0, sentByCloud: true },
    });

    await expect.element(screen.getByRole("heading", { name: "Venta completada" })).toBeVisible();
    await expect.element(screen.getByText(/Reembolso pendiente/)).not.toBeInTheDocument();
  });

  it("shows what the standalone terminal charged, with no change", async () => {
    const { screen } = await renderPanel({
      total: 476_000,
      method: "STANDALONE_TERMINAL",
      amount: 300_000,
    });

    await expect.element(screen.getByText("Terminal independiente", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 3.000,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it.each([
    ["DEBIT", "Point · Débito"],
    ["CREDIT", "Point · Crédito"],
    [null, "Point"],
  ] as const)("shows what the %s Point charged as %s, with no change", async (cardType, name) => {
    const { screen } = await renderPanel({
      total: 476_000,
      method: "POINT",
      cardType,
      amount: 300_000,
    });

    await expect.element(screen.getByText(name, { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 3.000,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
    await expect.element(screen.getByText("VUELTO", { exact: true })).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("starts a new sale from its only button once the receipt is printed", async () => {
    const { screen, onNewSale } = await renderPanel(CASH);
    await expect.element(screen.getByText("Impreso")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Nueva venta" }));

    expect(onNewSale).toHaveBeenCalledOnce();
    expect(screen.getByRole("button").elements()).toHaveLength(1);
  });

  it("starts a new sale with Enter, which its button shows", async () => {
    const { screen, onNewSale } = await renderPanel(CASH);
    const newSale = screen.getByRole("button", { name: "Nueva venta" });
    await expect.element(newSale).toBeEnabled();

    expect((newSale.element() as HTMLElement).querySelector("kbd")?.textContent).toBe("Enter");
    await userEvent.keyboard("{Enter}");

    expect(onNewSale).toHaveBeenCalledOnce();
  });

  it("asks the core for the print status of the sale it completed", async () => {
    const { readReceiptStatus, screen } = await renderPanel(CASH);
    await expect.element(screen.getByText("Impreso")).toBeVisible();

    expect(readReceiptStatus).toHaveBeenCalledWith("sale-1");
  });

  it("shows the receipt as being printed while the core has not answered", async () => {
    const { screen } = await renderPanel(CASH, {
      readReceiptStatus: () => new Promise(() => {}),
    });

    await expect.element(screen.getByText("Ticket", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Imprimiendo")).toBeVisible();
  });

  it("keeps Nueva venta disabled until the core first answers the print status", async () => {
    const { screen, onNewSale } = await renderPanel(CASH, {
      readReceiptStatus: () => new Promise(() => {}),
    });

    const newSale = screen.getByRole("button", { name: "Nueva venta" });
    await expect.element(newSale).toBeDisabled();
    (newSale.element() as HTMLElement).click();
    await userEvent.keyboard("{Enter}");
    expect(onNewSale).not.toHaveBeenCalled();
  });

  it("shows the receipt as being printed while the core says it is printing", async () => {
    const { screen } = await renderPanel(CASH, {
      readReceiptStatus: async () => found("printing"),
    });

    await expect.element(screen.getByText("Imprimiendo")).toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "Venta completada" })).toBeVisible();
  });

  it("asks again while the receipt is not printed and shows it once printed", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const answers = [found("printing"), found("printed", { printed: true })];
    const { screen, readReceiptStatus } = await renderPanel(CASH, {
      readReceiptStatus: async () => answers.shift() ?? found("printed", { printed: true }),
    });
    await expect.element(screen.getByText("Imprimiendo")).toBeVisible();

    await vi.advanceTimersByTimeAsync(2000);

    await expect.element(screen.getByText("Impreso")).toBeVisible();
    const reads = readReceiptStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(readReceiptStatus).toHaveBeenCalledTimes(reads);
  });

  it("says the print status could not be read, and still lets the cashier go on", async () => {
    const { screen, onNewSale } = await renderPanel(CASH, {
      readReceiptStatus: async () => ({ kind: "unavailable" }),
    });

    await expect.element(screen.getByText("No se pudo leer el estado")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Nueva venta" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Nueva venta" }));
    expect(onNewSale).toHaveBeenCalledOnce();
  });

  it.each([
    {
      standing: "paper_out",
      state: "Sin papel",
      title: "La impresora se quedó sin papel",
      help: "Poné un rollo nuevo y cerrá la tapa. El ticket sale solo cuando la impresora tenga papel.",
    },
    {
      standing: "cover_open",
      state: "Tapa abierta",
      title: "La tapa de la impresora está abierta",
      help: "Cerrala. El ticket sale solo cuando se cierre.",
    },
    {
      standing: "not_responding",
      state: "No responde",
      title: "La impresora no responde",
      help: "Revisá que esté encendida y con el cable conectado. El ticket sale solo cuando vuelva a responder.",
    },
    {
      standing: "printer_not_configured",
      state: "Sin configurar",
      title: "La impresora no está configurada",
      help: "Cargá su dirección en Impresora y después imprimí el ticket desde el historial de ventas.",
    },
  ] as const)(
    "tells that the sale stands and what to do when the printer reports $standing, with no retry",
    async ({ standing, state, title, help }) => {
      const { screen, onNewSale } = await renderPanel(CASH, {
        readReceiptStatus: async () => found(standing),
      });

      await expect.element(screen.getByRole("heading", { name: "Venta completada" })).toBeVisible();
      await expect.element(screen.getByText("VUELTO", { exact: true })).toBeVisible();
      await expect.element(screen.getByText("Venta", { exact: true })).toBeVisible();
      await expect.element(screen.getByText("Confirmada · no se deshace")).toBeVisible();
      await expect.element(screen.getByText("Impresora térmica")).toBeVisible();
      await expect.element(screen.getByText(state, { exact: true })).toBeVisible();
      await expect
        .element(screen.getByText("Pendiente de imprimir", { exact: true }))
        .toBeVisible();
      await expectAlertText(screen, title);
      await expectAlertText(screen, help);
      await expect
        .element(screen.getByRole("button", { name: "Reintentar impresión" }))
        .not.toBeInTheDocument();
      await expectNoAccessibilityViolations(screen.container);

      const keepSelling = screen.getByRole("button", { name: "Seguir vendiendo" });
      expect((keepSelling.element() as HTMLElement).querySelector("kbd")?.textContent).toBe(
        "Enter",
      );
      await userEvent.click(keepSelling);
      expect(onNewSale).toHaveBeenCalledOnce();
    },
  );

  it("keeps selling with Enter when the printer fails", async () => {
    const { screen, onNewSale } = await renderPanel(CASH, {
      readReceiptStatus: async () => found("paper_out"),
    });
    await expect.element(screen.getByText("Pendiente de imprimir")).toBeVisible();

    await userEvent.keyboard("{Enter}");

    expect(onNewSale).toHaveBeenCalledOnce();
  });

  it("keeps showing the change to hand over when the printer fails", async () => {
    const { screen } = await renderPanel(CASH, {
      readReceiptStatus: async () => found("paper_out"),
    });

    await expect.element(screen.getByText("VUELTO", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 240,00")).toBeVisible();
  });

  it.each(["cover_open", "paper_out", "not_responding"] as const)(
    "does not call the ticket retained while the printer reports %s a duplicate",
    async (standing) => {
      const { screen } = await renderPanel(CASH, {
        readReceiptStatus: async () => ({
          kind: "found",
          next_copy: { kind: "duplicate", order_number: 1 },
          printed: false,
          standing,
          comprobante: { kind: "none" },
          offer: null,
        }),
      });

      await expect
        .element(screen.getByText("Pendiente de imprimir", { exact: true }))
        .toBeVisible();
      await expect.element(screen.getByText(/duplicad/i)).not.toBeInTheDocument();
    },
  );

  it("tells that the sale stands and that the receipt is printed from the history when the print failed, with no retry", async () => {
    const { screen, onNewSale } = await renderPanel(CASH, {
      readReceiptStatus: async () => found("failed"),
    });

    await expect.element(screen.getByRole("heading", { name: "Venta completada" })).toBeVisible();
    await expect.element(screen.getByText("Confirmada · no se deshace")).toBeVisible();
    await expect.element(screen.getByText("Pendiente de imprimir", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Impresora térmica")).not.toBeInTheDocument();
    await expect
      .poll(() => screen.getByRole("alert").element().textContent)
      .toBe("Imprimilo desde el historial de ventas.");
    await expect
      .element(screen.getByRole("button", { name: "Reintentar impresión" }))
      .not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);

    await userEvent.click(screen.getByRole("button", { name: "Seguir vendiendo" }));
    expect(onNewSale).toHaveBeenCalledOnce();
  });

  describe("changing the printer from a failed print", () => {
    const FAILED_STANDINGS = [
      "cover_open",
      "paper_out",
      "not_responding",
      "printer_not_configured",
      "failed",
    ] as const;

    it.each(FAILED_STANDINGS)(
      "offers to change the printer, and goes to its screen, to a person who may, when the print stands as %s",
      async (standing) => {
        const { screen } = await renderPanel(CASH, {
          readReceiptStatus: async () => found(standing),
          mayChangePrinter: true,
        });

        await userEvent.click(screen.getByRole("button", { name: "Cambiar impresora" }));

        await expect.poll(() => screen.router.state.location.pathname).toBe("/receipt-printer");
      },
    );

    it("shows F2 on the link to change the printer and goes to its screen with that key", async () => {
      const { screen } = await renderPanel(CASH, {
        readReceiptStatus: async () => found("paper_out"),
        mayChangePrinter: true,
      });
      const change = screen.getByRole("button", { name: "Cambiar impresora" });
      await expect.element(change).toBeVisible();

      expect((change.element() as HTMLElement).querySelector("kbd")?.textContent).toBe("F2");
      await userEvent.keyboard("{F2}");

      await expect.poll(() => screen.router.state.location.pathname).toBe("/receipt-printer");
    });

    it("shows the link to change the printer as text with no icon", async () => {
      const { screen } = await renderPanel(CASH, {
        readReceiptStatus: async () => found("paper_out"),
        mayChangePrinter: true,
      });
      const change = screen.getByRole("button", { name: "Cambiar impresora" });
      await expect.element(change).toBeVisible();

      expect((change.element() as HTMLElement).querySelector("svg")).toBeNull();
    });

    it("does nothing on F2 for a person who may not configure the printer", async () => {
      const { screen } = await renderPanel(CASH, {
        readReceiptStatus: async () => found("paper_out"),
      });
      await expect.element(screen.getByText("Pendiente de imprimir")).toBeVisible();

      await userEvent.keyboard("{F2}");

      expect(screen.router.state.location.pathname).toBe("/");
    });

    it.each(FAILED_STANDINGS)(
      "does not offer to change the printer to a person who may not, when the print stands as %s",
      async (standing) => {
        const { screen } = await renderPanel(CASH, {
          readReceiptStatus: async () => found(standing),
        });

        await expect.element(screen.getByText("Pendiente de imprimir")).toBeVisible();
        await expect
          .element(screen.getByRole("button", { name: "Cambiar impresora" }))
          .not.toBeInTheDocument();
      },
    );

    it("does not offer it while the receipt prints", async () => {
      const { screen } = await renderPanel(CASH, {
        readReceiptStatus: async () => found("printing"),
        mayChangePrinter: true,
      });

      await expect.element(screen.getByText("Imprimiendo")).toBeVisible();
      await expect
        .element(screen.getByRole("button", { name: "Cambiar impresora" }))
        .not.toBeInTheDocument();
    });
  });

  describe("for a sale with a factura C", () => {
    const facturaC = (authorization: "real_time" | "offline_code"): Comprobante => ({
      kind: "fiscal",
      document_type: "factura_c",
      authorization,
      point_of_sale: 8,
      number: 412,
    });

    it("lists the factura C for the customer and the backup ticket to print, with the notice to keep it, in contingency", async () => {
      const { screen } = await renderPanel(CASH, {
        readReceiptStatus: async () => found("printing", { comprobante: facturaC("offline_code") }),
        readBackupTicket: async () => ticketOf("to_print"),
      });
      const documents = screen.getByRole("list", { name: "Documentos" });

      await expect.element(screen.getByText("VUELTO", { exact: true })).toBeVisible();
      await expect.element(screen.getByText("DOCUMENTOS")).toBeVisible();
      await expect.element(documents.getByText("Factura C", { exact: true })).toBeVisible();
      await expect.element(documents.getByText("Para el cliente")).toBeVisible();
      await expect.element(documents.getByText("Imprimiendo")).toBeVisible();
      await expect.element(documents.getByText("Ticket de respaldo de contingencia")).toBeVisible();
      await expect.element(documents.getByText("Queda en el local")).toBeVisible();
      await expect.element(documents.getByText("Por imprimir")).toBeVisible();
      await expect
        .element(screen.getByText("Guardá el ticket de respaldo en la caja del local"))
        .toBeVisible();
      await expect
        .element(
          screen.getByText("Queda ahí hasta que esta caja vuelva a sincronizar con la nube.", {
            exact: true,
          }),
        )
        .toBeVisible();
      await expect.element(screen.getByRole("button", { name: "Nueva venta" })).toBeVisible();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("shows no totals, no payment and no fiscal mode row in contingency", async () => {
      const { screen } = await renderPanel(CASH, {
        readReceiptStatus: async () => found("printing", { comprobante: facturaC("offline_code") }),
        readBackupTicket: async () => ticketOf("to_print"),
      });
      await expect.element(screen.getByText("DOCUMENTOS")).toBeVisible();

      await expect.element(screen.getByText("Total", { exact: true })).not.toBeInTheDocument();
      await expect.element(screen.getByText("Efectivo", { exact: true })).not.toBeInTheDocument();
      await expect.element(screen.getByText("Modo fiscal")).not.toBeInTheDocument();
      await expect.element(screen.getByText("Ticket", { exact: true })).not.toBeInTheDocument();
    });

    it("never asks whether to print in contingency, and starts a new sale from its button", async () => {
      const { screen, onNewSale, answerReceiptQuestion } = await renderPanel(CASH, {
        readReceiptStatus: async () => found("printing", { comprobante: facturaC("offline_code") }),
        readBackupTicket: async () => ticketOf("to_print"),
      });
      const newSale = screen.getByRole("button", { name: "Nueva venta" });
      await expect.element(newSale).toBeEnabled();

      await expect
        .element(screen.getByRole("group", { name: "¿Imprimir ticket?" }))
        .not.toBeInTheDocument();
      await expect.element(screen.getByRole("timer")).not.toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      await userEvent.keyboard("{Enter}");
      expect(answerReceiptQuestion).not.toHaveBeenCalled();
      expect(onNewSale).toHaveBeenCalledOnce();
    });

    it("shows the document as printed once it was", async () => {
      const { screen } = await renderPanel(CASH, {
        readReceiptStatus: async () =>
          found("printed", { printed: true, comprobante: facturaC("offline_code") }),
        readBackupTicket: async () => ticketOf("kept"),
      });
      const documents = screen.getByRole("list", { name: "Documentos" });

      await expect.element(documents.getByText("Impreso").first()).toBeVisible();
      await expect.element(documents.getByText("Imprimiendo")).not.toBeInTheDocument();
    });

    it("keeps the totals and the ticket row for a factura C authorized in real time", async () => {
      const { screen } = await renderPanel(CASH, {
        readReceiptStatus: async () =>
          found("printed", { printed: true, comprobante: facturaC("real_time") }),
      });

      await expect.element(screen.getByText("Ticket", { exact: true })).toBeVisible();
      await expect.element(screen.getByText("Impreso")).toBeVisible();
      await expect.element(screen.getByText("Total", { exact: true })).toBeVisible();
      await expect.element(screen.getByText("Para el cliente")).not.toBeInTheDocument();
    });

    it("keeps the totals and the ticket row for a sale with no comprobante", async () => {
      const { screen } = await renderPanel(CASH);

      await expect.element(screen.getByText("Ticket", { exact: true })).toBeVisible();
      await expect.element(screen.getByText("Total", { exact: true })).toBeVisible();
    });
  });

  describe("for a deferred sale's non-fiscal document", () => {
    const DEFERRED = { comprobante: { kind: "deferred_non_fiscal" } } as const;

    it("lists the document that is not valid as a factura and the backup ticket to print, with the notice to ask the customer to come back", async () => {
      const { screen } = await renderPanel(CASH, {
        readReceiptStatus: async () => found("printing", DEFERRED),
        readBackupTicket: async () => ticketOf("to_print"),
      });
      const documents = screen.getByRole("list", { name: "Documentos" });

      await expect.element(screen.getByText("VUELTO", { exact: true })).toBeVisible();
      await expect.element(documents.getByText("Documento no válido como factura")).toBeVisible();
      await expect
        .element(
          documents.getByText("Para el cliente · con la indicación de volver por la factura"),
        )
        .toBeVisible();
      await expect.element(documents.getByText("Imprimiendo")).toBeVisible();
      await expect.element(documents.getByText("Ticket de respaldo de contingencia")).toBeVisible();
      await expect.element(documents.getByText("Por imprimir")).toBeVisible();
      await expect
        .element(screen.getByText("Pedile al cliente que vuelva por su factura"))
        .toBeVisible();
      await expect
        .element(
          screen.getByText(
            "Guardá el ticket de respaldo en la caja del local hasta que esta caja vuelva a sincronizar.",
          ),
        )
        .toBeVisible();
      await expect.element(screen.getByRole("button", { name: "Nueva venta" })).toBeVisible();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("shows no totals, no payment and no fiscal mode row", async () => {
      const { screen } = await renderPanel(CASH, {
        readReceiptStatus: async () => found("printing", DEFERRED),
      });
      await expect.element(screen.getByText("DOCUMENTOS")).toBeVisible();

      await expect.element(screen.getByText("Total", { exact: true })).not.toBeInTheDocument();
      await expect.element(screen.getByText("Efectivo", { exact: true })).not.toBeInTheDocument();
      await expect.element(screen.getByText("Modo fiscal")).not.toBeInTheDocument();
    });

    it("never asks whether to print", async () => {
      const { screen, answerReceiptQuestion } = await renderPanel(CASH, {
        readReceiptStatus: async () => found("printing", DEFERRED),
      });
      await expect.element(screen.getByRole("button", { name: "Nueva venta" })).toBeEnabled();

      await expect.element(screen.getByRole("timer")).not.toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      expect(answerReceiptQuestion).not.toHaveBeenCalled();
    });

    it("shows the document as printed once it was", async () => {
      const { screen } = await renderPanel(CASH, {
        readReceiptStatus: async () => found("printed", { printed: true, ...DEFERRED }),
      });

      await expect.element(screen.getByText("Impreso")).toBeVisible();
    });

    it("asks the customer to come back for the invoice when the sale has a backup ticket", async () => {
      const { screen } = await renderPanel(CASH, {
        readReceiptStatus: async () => found("printed", { printed: true, ...DEFERRED }),
        readBackupTicket: async () => ticketOf("kept"),
      });

      await expect
        .element(screen.getByText("Pedile al cliente que vuelva por su factura"))
        .toBeVisible();
      await expect
        .element(
          screen.getByText("Guardá el ticket de respaldo en la caja del local", { exact: true }),
        )
        .not.toBeInTheDocument();
    });
  });

  describe("the notice to keep the backup ticket", () => {
    it.each([
      [
        "a contingency factura C",
        {
          comprobante: {
            kind: "fiscal",
            document_type: "factura_c",
            authorization: "offline_code",
            point_of_sale: 8,
            number: 412,
          },
        },
        "Guardá el ticket de respaldo en la caja del local",
      ],
      [
        "a deferred sale",
        { comprobante: { kind: "deferred_non_fiscal" } },
        "Pedile al cliente que vuelva por su factura",
      ],
    ] as const)("is marked with a receipt for %s", async (_sale, receipt, title) => {
      const { screen } = await renderPanel(CASH, {
        readReceiptStatus: async () => found("printing", receipt),
        readBackupTicket: async () => ticketOf("to_print"),
      });
      const notice = screen.getByText(title, { exact: true });
      await expect.element(notice).toBeVisible();

      const frame = (notice.element() as HTMLElement).parentElement?.parentElement;
      expect(frame?.querySelector("svg.lucide-receipt")).not.toBeNull();
    });
  });

  describe("for a sale with a contingency backup ticket", () => {
    const FISCAL_OFFLINE: Comprobante = {
      kind: "fiscal",
      document_type: "factura_c",
      authorization: "offline_code",
      point_of_sale: 8,
      number: 412,
    };

    async function renderWithTicket(standing: BackupStanding, overrides: Overrides = {}) {
      const rendered = await renderPanel(CASH, {
        readReceiptStatus: async () => found("printed", { printed: true }),
        readBackupTicket: async () => ticketOf(standing),
        ...overrides,
      });
      const documents = rendered.screen.getByRole("list", { name: "Documentos" });
      return { ...rendered, documents };
    }

    it.each([
      ["kept", "Impreso"],
      ["discardable", "Impreso"],
      ["discarded", "Impreso"],
      ["to_print", "Por imprimir"],
      ["awaiting_customer_document", "Por imprimir"],
      ["no_longer_needed", "No hace falta"],
      ["missing_key", "Sin clave de respaldo"],
    ] as const)("lists the ticket as it stands when it is %s", async (standing, status) => {
      const { screen, documents } = await renderWithTicket(standing);

      await expect.element(documents.getByText("Ticket de respaldo de contingencia")).toBeVisible();
      await expect.element(documents.getByText("Queda en el local")).toBeVisible();
      await expect.element(documents.getByText(status)).toBeVisible();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("lists it after the customer's document", async () => {
      const { documents } = await renderWithTicket("kept", {
        readReceiptStatus: async () =>
          found("printed", { printed: true, comprobante: FISCAL_OFFLINE }),
      });

      await expect
        .poll(() =>
          documents
            .getByRole("listitem")
            .elements()
            .map((row) => row.textContent),
        )
        .toEqual([
          expect.stringContaining("Factura C"),
          expect.stringContaining("Ticket de respaldo de contingencia"),
        ]);
    });

    it.each([["kept"], ["to_print"], ["awaiting_customer_document"]] as const)(
      "tells the cashier to keep the ticket in the register's box when it is %s",
      async (standing) => {
        const { screen } = await renderWithTicket(standing);

        await expect
          .element(screen.getByText("Guardá el ticket de respaldo en la caja del local"))
          .toBeVisible();
        await expect
          .element(
            screen.getByText("Queda ahí hasta que esta caja vuelva a sincronizar con la nube."),
          )
          .toBeVisible();
      },
    );

    it.each([
      ["no_longer_needed", "No hace falta"],
      ["missing_key", "Sin clave de respaldo"],
      ["discardable", "Impreso"],
      ["discarded", "Impreso"],
    ] as const)("tells nothing to keep when the ticket is %s", async (standing, status) => {
      const { screen, documents } = await renderWithTicket(standing);

      await expect.element(documents.getByText(status)).toBeVisible();
      await expect
        .element(screen.getByText("Guardá el ticket de respaldo en la caja del local"))
        .not.toBeInTheDocument();
    });

    it.each([
      ["paper_out", "Sin papel"],
      ["cover_open", "Tapa abierta"],
      ["not_responding", "No responde"],
      ["printer_not_configured", "Sin configurar"],
    ] as const)("shows the printer failure %s on a ticket still to print", async (printer, tag) => {
      const { documents } = await renderWithTicket("to_print", {
        readBackupTickets: async () => ({
          kind: "read",
          tickets: backupTickets({ to_print: 1, printer }),
        }),
      });

      await expect.element(documents.getByText(tag)).toBeVisible();
      await expect.element(documents.getByText("Por imprimir")).not.toBeInTheDocument();
    });

    it("keeps saying it is to print for a printer failure with no name", async () => {
      const { documents } = await renderWithTicket("to_print", {
        readBackupTickets: async () => ({
          kind: "read",
          tickets: backupTickets({ to_print: 1, printer: "failed" }),
        }),
      });

      await expect.element(documents.getByText("Por imprimir")).toBeVisible();
    });

    it("does not ask for the printer's state unless the ticket is still to print", async () => {
      const { documents, readBackupTickets } = await renderWithTicket("kept");

      await expect.element(documents.getByText("Impreso")).toBeVisible();
      expect(readBackupTickets).not.toHaveBeenCalled();
    });

    it("shows no ticket row and no notice when the sale has no ticket", async () => {
      const { screen } = await renderPanel(CASH, {
        readReceiptStatus: async () => found("printed", { printed: true }),
        readBackupTicket: async () => ticketOf(null),
      });

      await expect.element(screen.getByText("Ticket", { exact: true })).toBeVisible();
      await expect
        .element(screen.getByText("Ticket de respaldo de contingencia"))
        .not.toBeInTheDocument();
      await expect
        .element(screen.getByText("Guardá el ticket de respaldo en la caja del local"))
        .not.toBeInTheDocument();
    });

    it.each([
      ["unavailable", { kind: "unavailable" }],
      ["not signed in", { kind: "not_signed_in" }],
    ] as const)("shows no ticket row when the core answers %s", async (_name, outcome) => {
      const { screen } = await renderPanel(CASH, {
        readReceiptStatus: async () => found("printed", { printed: true }),
        readBackupTicket: async () => outcome,
      });

      await expect.element(screen.getByText("Nueva venta")).toBeVisible();
      await expect
        .element(screen.getByText("Ticket de respaldo de contingencia"))
        .not.toBeInTheDocument();
    });

    it("asks again while the ticket is not printed and shows it once printed, then stops asking", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const answers = [ticketOf("to_print"), ticketOf("kept")];
      const { documents, readBackupTicket } = await renderWithTicket("to_print", {
        readBackupTicket: async () => answers.shift() ?? ticketOf("kept"),
      });
      await expect.element(documents.getByText("Por imprimir")).toBeVisible();

      await vi.advanceTimersByTimeAsync(2000);

      await expect.element(documents.getByText("Impreso")).toBeVisible();
      const reads = readBackupTicket.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5000);
      expect(readBackupTicket).toHaveBeenCalledTimes(reads);
    });
  });
});
