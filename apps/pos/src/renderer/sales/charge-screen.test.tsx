import type { CurrentSaleAnswer, ReceiptPrintStatusOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  chargeInCash,
  chooseCash,
  chooseTransfer,
  PERSON,
  renderScreen,
  SALE_OF_ONE_LINE,
  SALE_OF_TWO_LINES,
  SALE_WITH_PART_PAID,
  valueBeside,
} from "./test-support/charge-screen";

const FAILED_PRINT: ReceiptPrintStatusOutcome = {
  kind: "found",
  next_copy: { kind: "original" },
  printed: false,
  standing: "failed",
  comprobante: { kind: "none" },
};

describe("ChargeScreen", () => {
  it("offers transfer and the independent terminal when no method was chosen", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("heading", { name: "Otros medios" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Transferencia" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Terminal independiente" }))
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the search field and the locked lines of the sale in progress beside the panel", async () => {
    const { screen } = await renderScreen({ currentSale: async () => SALE_OF_TWO_LINES });

    await expect.element(screen.getByPlaceholder("Escaneá o escribí el nombre")).toBeDisabled();
    const lines = screen.getByRole("table", { name: "Líneas de la venta" });
    await expect.element(lines.getByText("Yerba mate 1 kg")).toBeVisible();
    await expect.element(lines.getByText("Alfajor triple")).toBeVisible();
    await expect.element(lines.getByRole("img", { name: "Líneas bloqueadas" })).toBeVisible();
    await expect.element(screen.getByText("Elegí el medio de pago")).not.toBeInTheDocument();
    await expect.element(screen.getByText(/COBRO · VENTA DE/)).not.toBeInTheDocument();
  });

  it("shows the total still to be charged as what is to be charged", async () => {
    const { screen } = await renderScreen({ currentSale: async () => SALE_OF_TWO_LINES });

    const panel = screen.getByRole("complementary", { name: "Otros medios" });
    await expect.element(panel.getByText("A COBRAR")).toBeVisible();
    await expect.element(panel.getByText("$ 6.260,00")).toBeVisible();
  });

  it("shows the total, what is paid and what is missing in the combined payment", async () => {
    const { screen } = await renderScreen({
      method: "QR",
      currentSale: async () => SALE_WITH_PART_PAID,
      paymentMethodAvailability: async () => ({
        qr: "offline",
        point: "offline",
        point_minimum: 1500,
        qr_minimum: 1500,
      }),
    });

    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.element(panel.getByText("FALTA")).toBeVisible();
    await expect.element(panel.getByText("$ 3.760,00")).toBeVisible();
    await expect.poll(() => valueBeside(screen, "Total")).toBe("$ 4.760,00");
    await expect.poll(() => valueBeside(screen, "Transferencia")).toBe("– $ 1.000,00");
  });

  it("marks Venta as the current screen of the menu", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("navigation", { name: "Menú de la caja" }).getByText("Venta"))
      .toBeVisible();
    await expect.element(screen.getByText("Ada")).not.toBeInTheDocument();
  });

  it("offers the sales history in the menu to a person who may view it", async () => {
    const { screen } = await renderScreen({
      person: { ...PERSON, abilities: ["open_cash_session", "view_sales_history"] },
    });

    await expect.element(screen.getByRole("link", { name: "Historial" })).toBeVisible();
  });

  it("goes back to the sale from Otros medios with Esc", async () => {
    const { screen } = await renderScreen();

    await userEvent.keyboard("{Escape}");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it("goes back to the sale from the close button of Otros medios", async () => {
    const { screen } = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar con Esc" }));

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it.each<[string, CurrentSaleAnswer]>([
    ["there is no sale", null],
    [
      "the sale has no lines",
      {
        id: "sale-1",
        lines: [],
        total: 0,
        paid: 0,
        pending: 0,
        payments: [],
        lines_lock: null,
        cancel_refusal: null,
        charge_refusal: null,
        rebuilt_paid_order: null,
        mercado_pago_charge_in_progress: null,
        refunds_on_cancel: [],
        cancel_authorization_required: false,
        adjust_authorization_required: false,
        sale_discount_authorization_required: false,
        sale_discount_refusal: "empty_sale",
        sale_discount: null,
        gross_subtotal: 0,
        subtotal: 0,
        promotion_savings: 0,
      },
    ],
    ["the person may not sell", "not_permitted"],
  ])("goes back to the sale when %s", async (_, answer) => {
    const { screen } = await renderScreen({ currentSale: async () => answer });

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it("says the sale could not be loaded and reads it again on retry", async () => {
    const answers = [
      () => Promise.reject(new Error("the core could not read the sale in progress")),
      () => Promise.resolve(SALE_OF_ONE_LINE),
    ];
    const { screen, currentSale } = await renderScreen({
      currentSale: () => {
        const answer = answers.shift();
        if (answer === undefined) {
          throw new Error("no answer left");
        }
        return answer();
      },
    });

    await expect.element(screen.getByText("No se pudo cargar la venta")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(screen.getByRole("heading", { name: "Otros medios" })).toBeVisible();
    expect(currentSale).toHaveBeenCalledTimes(2);
  });

  it("opens the cash charge when Efectivo is chosen, and goes back to the sale with Esc", async () => {
    const { screen } = await renderScreen();

    await chooseCash(screen);
    await expect
      .element(screen.getByRole("complementary", { name: "Cobro en efectivo" }))
      .toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it("charges the sale in cash and shows it as completed with the change", async () => {
    const { screen, chargeSaleInCash } = await renderScreen();

    await chargeInCash(screen, "5000,00");

    await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "Entregá el vuelto" })).toBeVisible();
    expect(chargeSaleInCash).toHaveBeenCalledExactlyOnceWith("sale-1", 500_000);
  });

  it("asks the core for the print status of the sale it completed, after a cash charge", async () => {
    const { screen, receiptPrintStatus } = await renderScreen();

    await chargeInCash(screen, "5000,00");

    await expect.element(screen.getByText("Impreso")).toBeVisible();
    expect(receiptPrintStatus).toHaveBeenCalledWith("sale-1");
  });

  it("hands the cashier's answer about the customer's ticket to the core, with the completed sale's id", async () => {
    const { screen, answerReceiptQuestion } = await renderScreen({
      receiptPrintStatus: async () => ({
        kind: "found",
        next_copy: { kind: "original" },
        printed: false,
        standing: "awaiting_answer",
        comprobante: { kind: "none" },
      }),
    });

    await chargeInCash(screen, "5000,00");
    await userEvent.click(screen.getByRole("button", { name: "Sí" }));

    await expect.poll(() => answerReceiptQuestion.mock.calls).toEqual([["sale-1", true]]);
  });

  it("asks the core for the contingency backup ticket of the sale it completed and lists it", async () => {
    const { screen, contingencyBackupTicketOfSale } = await renderScreen({
      contingencyBackupTicketOfSale: async () => ({ kind: "read", ticket: { standing: "kept" } }),
    });

    await chargeInCash(screen, "5000,00");

    await expect.element(screen.getByText("Ticket de respaldo de contingencia")).toBeVisible();
    expect(contingencyBackupTicketOfSale).toHaveBeenCalledWith("sale-1");
  });

  it("asks the core for the print status of the sale it completed, after a transfer", async () => {
    const { screen, receiptPrintStatus } = await renderScreen();

    await chooseTransfer(screen);
    await userEvent.click(screen.getByRole("button", { name: "Registrar transferencia" }));

    await expect.element(screen.getByText("Impreso")).toBeVisible();
    expect(receiptPrintStatus).toHaveBeenCalledWith("sale-1");
  });

  it("shows the printer failure of the completed sale, which prints by itself once resolved", async () => {
    const { screen } = await renderScreen({
      receiptPrintStatus: async () => ({
        kind: "found",
        next_copy: { kind: "original" },
        printed: false,
        standing: "paper_out",
        comprobante: { kind: "none" },
      }),
    });

    await chargeInCash(screen, "5000,00");

    await expect.element(screen.getByText("La impresora se quedó sin papel")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Reintentar impresión" }))
      .not.toBeInTheDocument();
  });

  it("offers to change the printer on a failed print to a person who may configure it", async () => {
    const { screen } = await renderScreen({
      person: { ...PERSON, abilities: ["open_cash_session", "configure_receipt_printer"] },
      receiptPrintStatus: async () => FAILED_PRINT,
    });

    await chargeInCash(screen, "5000,00");

    await expect.element(screen.getByRole("button", { name: "Cambiar impresora" })).toBeVisible();
  });

  it("does not offer to change the printer on a failed print to a person who may not configure it", async () => {
    const { screen } = await renderScreen({ receiptPrintStatus: async () => FAILED_PRINT });

    await chargeInCash(screen, "5000,00");

    await expect.element(screen.getByText("No se pudo imprimir el ticket")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Cambiar impresora" }))
      .not.toBeInTheDocument();
  });

  it("shows the sale as paid behind the completed sale, with no way back to it", async () => {
    const { screen } = await renderScreen();

    await chargeInCash(screen, "5000,00");

    const panel = screen.getByRole("complementary", {
      name: "Panel de cobro",
      includeHidden: true,
    });
    await expect.element(panel.getByText("Saldo pendiente")).toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Volver a la venta", includeHidden: true }))
      .not.toBeInTheDocument();
  });

  it.each([
    { kind: "reaches_buyer_identification_threshold", threshold: 476_000 },
    { kind: "no_buyer_identification_threshold" },
  ] as const)("offers no way to pay a sale the core refuses to charge: %j", async (refusal) => {
    const { screen } = await renderScreen({
      currentSale: async () => ({ ...SALE_OF_ONE_LINE, charge_refusal: refusal }),
    });

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
    await expect
      .element(screen.getByRole("heading", { name: "Otros medios" }))
      .not.toBeInTheDocument();
  });

  it("goes back to the methods, with the balance the core now answers, after a partial cash payment", async () => {
    const reads: CurrentSaleAnswer[] = [
      SALE_OF_ONE_LINE,
      {
        ...SALE_OF_ONE_LINE,
        paid: 400_000,
        pending: 76_000,
        payments: [{ method: "CASH", card_type: null, amount: 400_000 }],
      },
    ];
    const { screen, chargeSaleInCash } = await renderScreen({
      method: "CASH",
      currentSale: async () => reads.shift() ?? SALE_WITH_PART_PAID,
      cashCharge: async () => ({ kind: "partial", applied: 400_000, pending: 76_000 }),
      chargeSaleInCash: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 400_000,
        pending: 76_000,
      }),
    });

    await userEvent.fill(screen.getByRole("textbox", { name: "RECIBIDO" }), "4000,00");
    await userEvent.click(screen.getByRole("button", { name: "Registrar pago parcial" }));

    await expect
      .element(screen.getByRole("complementary", { name: "Cobro en efectivo" }))
      .not.toBeInTheDocument();
    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.element(panel.getByText("FALTA")).toBeVisible();
    await expect.poll(() => valueBeside(screen, "Efectivo")).toBe("– $ 4.000,00");
    await expect.element(panel.getByText("$ 760,00")).toBeVisible();
    await expect.element(screen.getByText("VENTA COMPLETADA")).not.toBeInTheDocument();
    expect(chargeSaleInCash).toHaveBeenCalledExactlyOnceWith("sale-1", 400_000);
  });

  it("keeps the cash charge busy, so it cannot charge again, until the core answers the new balance", async () => {
    const reads = [SALE_OF_ONE_LINE];
    const { screen, chargeSaleInCash } = await renderScreen({
      method: "CASH",
      currentSale: () => {
        const read = reads.shift();
        return read === undefined
          ? new Promise<CurrentSaleAnswer>(() => {})
          : Promise.resolve(read);
      },
      cashCharge: async () => ({ kind: "partial", applied: 400_000, pending: 76_000 }),
      chargeSaleInCash: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 400_000,
        pending: 76_000,
      }),
    });

    await userEvent.fill(screen.getByRole("textbox", { name: "RECIBIDO" }), "4000,00");
    await userEvent.click(screen.getByRole("button", { name: "Registrar pago parcial" }));

    await expect
      .element(screen.getByRole("button", { name: "Registrar pago parcial" }))
      .toBeDisabled();
    expect(chargeSaleInCash).toHaveBeenCalledOnce();
  });

  it("keeps the transfer busy, so it cannot charge again, until the core answers the new balance", async () => {
    const reads = [SALE_OF_ONE_LINE];
    const { screen, chargeSaleByTransfer } = await renderScreen({
      currentSale: () => {
        const read = reads.shift();
        return read === undefined
          ? new Promise<CurrentSaleAnswer>(() => {})
          : Promise.resolve(read);
      },
      chargeSaleByTransfer: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 200_000,
        pending: 276_000,
      }),
    });

    await chooseTransfer(screen);
    await userEvent.fill(screen.getByRole("textbox", { name: "IMPORTE" }), "2000,00");
    await userEvent.click(screen.getByRole("button", { name: "Registrar transferencia" }));

    await expect.poll(() => chargeSaleByTransfer.mock.calls.length).toBe(1);
    await expect
      .element(screen.getByRole("button", { name: "Registrar transferencia" }))
      .toBeDisabled();
  });

  it("says the sale could not be loaded when it cannot be read again after a partial cash payment", async () => {
    const reads = [SALE_OF_ONE_LINE];
    const { screen } = await renderScreen({
      method: "CASH",
      currentSale: async () => {
        const read = reads.shift();
        if (read === undefined) {
          throw new Error("the core could not read the sale in progress");
        }
        return read;
      },
      cashCharge: async () => ({ kind: "partial", applied: 400_000, pending: 76_000 }),
      chargeSaleInCash: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 400_000,
        pending: 76_000,
      }),
    });

    await userEvent.fill(screen.getByRole("textbox", { name: "RECIBIDO" }), "4000,00");
    await userEvent.click(screen.getByRole("button", { name: "Registrar pago parcial" }));

    await expect.element(screen.getByText("No se pudo cargar la venta")).toBeVisible();
    await expect.element(screen.getByText("FALTA")).not.toBeInTheDocument();
  });

  it("says the sale could not be loaded when it cannot be read again after a partial transfer", async () => {
    const reads = [SALE_OF_ONE_LINE];
    const { screen } = await renderScreen({
      currentSale: async () => {
        const read = reads.shift();
        if (read === undefined) {
          throw new Error("the core could not read the sale in progress");
        }
        return read;
      },
      chargeSaleByTransfer: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 200_000,
        pending: 276_000,
      }),
    });

    await chooseTransfer(screen);
    await userEvent.fill(screen.getByRole("textbox", { name: "IMPORTE" }), "2000,00");
    await userEvent.click(screen.getByRole("button", { name: "Registrar transferencia" }));

    await expect.element(screen.getByText("No se pudo cargar la venta")).toBeVisible();
    await expect.element(screen.getByText("FALTA")).not.toBeInTheDocument();
  });

  it("charges the pending balance by transfer unless the cashier lowers the amount", async () => {
    const { screen, chargeSaleByTransfer } = await renderScreen({
      currentSale: async () => SALE_WITH_PART_PAID,
    });

    await chooseTransfer(screen);
    await userEvent.click(screen.getByRole("button", { name: "Registrar transferencia" }));

    expect(chargeSaleByTransfer).toHaveBeenCalledExactlyOnceWith("sale-1", 376_000);
  });

  it("goes back to the methods, with the balance the core now answers, after a partial transfer", async () => {
    const reads: CurrentSaleAnswer[] = [
      SALE_OF_ONE_LINE,
      {
        ...SALE_OF_ONE_LINE,
        paid: 200_000,
        pending: 276_000,
        payments: [{ method: "TRANSFER", card_type: null, amount: 200_000 }],
      },
    ];
    const { screen, chargeSaleByTransfer } = await renderScreen({
      currentSale: async () => reads.shift() ?? SALE_WITH_PART_PAID,
      chargeSaleByTransfer: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 200_000,
        pending: 276_000,
      }),
    });

    await chooseTransfer(screen);
    await userEvent.fill(screen.getByRole("textbox", { name: "IMPORTE" }), "2000,00");
    await userEvent.click(screen.getByRole("button", { name: "Registrar transferencia" }));

    await expect
      .element(screen.getByRole("heading", { name: "Transferencia" }))
      .not.toBeInTheDocument();
    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.poll(() => valueBeside(screen, "Transferencia")).toBe("– $ 2.000,00");
    await expect.element(panel.getByText("$ 2.760,00")).toBeVisible();
    expect(chargeSaleByTransfer).toHaveBeenCalledExactlyOnceWith("sale-1", 200_000);
  });

  it("starts a new sale from Nueva venta by going back to the sale screen", async () => {
    const { screen } = await renderScreen();

    await chargeInCash(screen, "5000,00");
    await userEvent.click(screen.getByRole("button", { name: "Nueva venta" }));

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it.each([["empty_sale"], ["zero_total"], ["no_open_sale"], ["not_permitted"]] as const)(
    "goes back to the sale when the core answers %s",
    async (kind) => {
      const { screen } = await renderScreen({ chargeSaleInCash: async () => ({ kind }) });

      await chargeInCash(screen, "5000,00");

      await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
    },
  );

  it.each([
    { kind: "reaches_buyer_identification_threshold", threshold: 476_000 },
    { kind: "no_buyer_identification_threshold" },
  ] as const)("goes back to the sale when the core answers %j", async (outcome) => {
    const { screen } = await renderScreen({ chargeSaleInCash: async () => outcome });

    await chargeInCash(screen, "5000,00");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it.each([["not_signed_in"], ["no_open_session"]] as const)(
    "reports an invalid session when the core answers %s",
    async (kind) => {
      const { screen, onSessionInvalid } = await renderScreen({
        chargeSaleInCash: async () => ({ kind }),
      });

      await chargeInCash(screen, "5000,00");

      await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
    },
  );

  it("opens the transfer without charging when Transferencia is chosen, and returns to Otros medios with Esc", async () => {
    const { screen, chargeSaleByTransfer } = await renderScreen();

    await chooseTransfer(screen);
    await expect.element(screen.getByRole("heading", { name: "Transferencia" })).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("heading", { name: "Otros medios" })).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Transferencia" }))
      .not.toBeInTheDocument();
    expect(chargeSaleByTransfer).not.toHaveBeenCalled();
  });

  it("charges the sale by transfer from Registrar transferencia and shows it as completed with no change", async () => {
    const { screen, chargeSaleByTransfer } = await renderScreen();

    await chooseTransfer(screen);
    await userEvent.click(screen.getByRole("button", { name: "Registrar transferencia" }));

    await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "No hay vuelto para entregar" }))
      .toBeVisible();
    expect(chargeSaleByTransfer).toHaveBeenCalledExactlyOnceWith("sale-1", 476_000);
  });

  it("starts a new sale after a transfer by going back to the sale screen", async () => {
    const { screen } = await renderScreen();

    await chooseTransfer(screen);
    await userEvent.click(screen.getByRole("button", { name: "Registrar transferencia" }));
    await userEvent.click(screen.getByRole("button", { name: "Nueva venta" }));

    await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
  });

  it.each([["empty_sale"], ["zero_total"], ["no_open_sale"], ["not_permitted"]] as const)(
    "goes back to the sale when the core answers %s to a transfer",
    async (kind) => {
      const { screen } = await renderScreen({ chargeSaleByTransfer: async () => ({ kind }) });

      await chooseTransfer(screen);
      await userEvent.click(screen.getByRole("button", { name: "Registrar transferencia" }));

      await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
    },
  );

  it.each([["not_signed_in"], ["no_open_session"]] as const)(
    "reports an invalid session when the core answers %s to a transfer",
    async (kind) => {
      const { screen, onSessionInvalid } = await renderScreen({
        chargeSaleByTransfer: async () => ({ kind }),
      });

      await chooseTransfer(screen);
      await userEvent.click(screen.getByRole("button", { name: "Registrar transferencia" }));

      await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
    },
  );
});
