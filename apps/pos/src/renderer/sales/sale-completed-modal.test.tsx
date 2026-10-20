import type { ReceiptPrintStatusOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { SaleCompletedModal } from "./sale-completed-modal";

afterEach(() => {
  vi.useRealTimers();
});

type Standing = Extract<ReceiptPrintStatusOutcome, { kind: "found" }>["standing"];

type Comprobante = Extract<ReceiptPrintStatusOutcome, { kind: "found" }>["comprobante"];

function found(
  standing: Standing,
  {
    printed = false,
    comprobante = { kind: "none" },
  }: { printed?: boolean; comprobante?: Comprobante } = {},
): ReceiptPrintStatusOutcome {
  return { kind: "found", next_copy: { kind: "original" }, printed, standing, comprobante };
}

type Amounts =
  | { total: number; tendered: number; change: number }
  | { total: number; method: "TRANSFER"; amount: number }
  | { total: number; method: "QR"; amount: number }
  | { total: number; method: "POINT"; amount: number }
  | { total: number; method: "STANDALONE_TERMINAL"; amount: number };

type Overrides = {
  readReceiptStatus?: () => Promise<ReceiptPrintStatusOutcome>;
  mayChangePrinter?: boolean;
};

async function renderModal(amounts: Amounts, overrides: Overrides = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const onNewSale = vi.fn();
  const readReceiptStatus = vi.fn(
    overrides.readReceiptStatus ?? (async () => found(null, { printed: true })),
  );
  const screen = await render(
    <SaleCompletedModal
      {...amounts}
      saleId="sale-1"
      readReceiptStatus={readReceiptStatus}
      mayChangePrinter={overrides.mayChangePrinter ?? false}
      onNewSale={onNewSale}
    />,
  );
  return { screen, onNewSale, readReceiptStatus };
}

async function expectAlertText(
  screen: { getByRole: (role: "alert") => { element: () => Element } },
  text: string,
) {
  await expect.poll(() => screen.getByRole("alert").element().textContent).toContain(text);
}

const CASH = { total: 476_000, tendered: 500_000, change: 24_000 };

describe("SaleCompletedModal", () => {
  it("tells the cashier to hand over the change and shows what was charged", async () => {
    const { screen } = await renderModal(CASH);

    await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "Entregá el vuelto" })).toBeVisible();
    await expect.element(screen.getByText("VUELTO", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 240,00")).toBeVisible();
    await expect.element(screen.getByText("Total", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
    await expect.element(screen.getByText("Efectivo entregado")).toBeVisible();
    await expect.element(screen.getByText("$ 5.000,00")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says there is no change to hand over, and leaves the change row out, when the payment was exact", async () => {
    const { screen } = await renderModal({ total: 476_000, tendered: 476_000, change: 0 });

    await expect
      .element(screen.getByRole("heading", { name: "No hay vuelto para entregar" }))
      .toBeVisible();
    await expect.element(screen.getByText("VUELTO", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("Efectivo entregado")).toBeVisible();
  });

  it("says there is no change to hand over and shows the total charged by transfer", async () => {
    const { screen } = await renderModal({ total: 476_000, method: "TRANSFER", amount: 476_000 });

    await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "No hay vuelto para entregar" }))
      .toBeVisible();
    await expect.element(screen.getByText("Total", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Transferencia", { exact: true })).toBeVisible();
    expect(screen.getByText("$ 4.760,00").elements()).toHaveLength(2);
    await expect.element(screen.getByText("VUELTO", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("Efectivo entregado")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows only what the last transfer charged when it paid part of the sale", async () => {
    const { screen } = await renderModal({ total: 476_000, method: "TRANSFER", amount: 300_000 });

    await expect.element(screen.getByText("Transferencia", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 3.000,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
  });

  it("says there is no change to hand over and shows what the Mercado Pago QR charged", async () => {
    const { screen } = await renderModal({ total: 476_000, method: "QR", amount: 300_000 });

    await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "No hay vuelto para entregar" }))
      .toBeVisible();
    await expect.element(screen.getByText("QR de Mercado Pago", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 3.000,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
    await expect.element(screen.getByText("VUELTO", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("Efectivo entregado")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says there is no change to hand over and shows what the standalone terminal charged", async () => {
    const { screen } = await renderModal({
      total: 476_000,
      method: "STANDALONE_TERMINAL",
      amount: 300_000,
    });

    await expect
      .element(screen.getByRole("heading", { name: "No hay vuelto para entregar" }))
      .toBeVisible();
    await expect.element(screen.getByText("Terminal independiente", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 3.000,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says there is no change to hand over and shows what the integrated terminal charged", async () => {
    const { screen } = await renderModal({ total: 476_000, method: "POINT", amount: 300_000 });

    await expect
      .element(screen.getByRole("heading", { name: "No hay vuelto para entregar" }))
      .toBeVisible();
    await expect.element(screen.getByText("Point integrada", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 3.000,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
    await expect.element(screen.getByText("VUELTO", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("Efectivo entregado")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("starts a new sale from its only button once the receipt is printed", async () => {
    const { screen, onNewSale } = await renderModal(CASH);
    await expect.element(screen.getByText("Impreso")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Nueva venta" }));

    expect(onNewSale).toHaveBeenCalledOnce();
    expect(screen.getByRole("button").elements()).toHaveLength(1);
  });

  it("asks the core for the print status of the sale it completed", async () => {
    const { readReceiptStatus, screen } = await renderModal(CASH);
    await expect.element(screen.getByText("Impreso")).toBeVisible();

    expect(readReceiptStatus).toHaveBeenCalledWith("sale-1");
  });

  it("shows the receipt as being printed while the core has not answered", async () => {
    const { screen } = await renderModal(CASH, {
      readReceiptStatus: () => new Promise(() => {}),
    });

    await expect.element(screen.getByText("Ticket", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Imprimiendo")).toBeVisible();
  });

  it("shows the receipt as being printed while the core says it is printing", async () => {
    const { screen } = await renderModal(CASH, {
      readReceiptStatus: async () => found("printing"),
    });

    await expect.element(screen.getByText("Imprimiendo")).toBeVisible();
    await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
  });

  it("asks again while the receipt is not printed and shows it once printed", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const answers = [found("printing"), found("printed", { printed: true })];
    const { screen, readReceiptStatus } = await renderModal(CASH, {
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
    const { screen, onNewSale } = await renderModal(CASH, {
      readReceiptStatus: async () => ({ kind: "unavailable" }),
    });

    await expect.element(screen.getByText("No se pudo leer el estado")).toBeVisible();
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
      const { screen, onNewSale } = await renderModal(CASH, {
        readReceiptStatus: async () => found(standing),
      });

      await expect.element(screen.getByText("IMPRESORA", { exact: true })).toBeVisible();
      await expect
        .element(screen.getByRole("heading", { name: "No se pudo imprimir el ticket" }))
        .toBeVisible();
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

      await userEvent.click(screen.getByRole("button", { name: "Seguir vendiendo" }));
      expect(onNewSale).toHaveBeenCalledOnce();
    },
  );

  it("keeps showing the change to hand over when the printer fails", async () => {
    const { screen } = await renderModal(CASH, {
      readReceiptStatus: async () => found("paper_out"),
    });

    await expect.element(screen.getByText("Vuelto a entregar")).toBeVisible();
    await expect.element(screen.getByText("$ 240,00")).toBeVisible();
  });

  it.each(["cover_open", "paper_out", "not_responding"] as const)(
    "does not call the ticket retained while the printer reports %s a duplicate",
    async (standing) => {
      const { screen } = await renderModal(CASH, {
        readReceiptStatus: async () => ({
          kind: "found",
          next_copy: { kind: "duplicate", order_number: 1 },
          printed: false,
          standing,
        }),
      });

      await expect
        .element(screen.getByText("Pendiente de imprimir", { exact: true }))
        .toBeVisible();
      await expect.element(screen.getByText(/duplicad/i)).not.toBeInTheDocument();
    },
  );

  it("tells that the sale stands and that the receipt is printed from the history when the print failed, with no retry", async () => {
    const { screen, onNewSale } = await renderModal(CASH, {
      readReceiptStatus: async () => found("failed"),
    });

    await expect
      .element(screen.getByRole("heading", { name: "No se pudo imprimir el ticket" }))
      .toBeVisible();
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
        const { screen } = await renderModal(CASH, {
          readReceiptStatus: async () => found(standing),
          mayChangePrinter: true,
        });

        await userEvent.click(screen.getByRole("button", { name: "Cambiar impresora" }));

        await expect.poll(() => screen.router.state.location.pathname).toBe("/receipt-printer");
      },
    );

    it.each(FAILED_STANDINGS)(
      "does not offer to change the printer to a person who may not, when the print stands as %s",
      async (standing) => {
        const { screen } = await renderModal(CASH, {
          readReceiptStatus: async () => found(standing),
        });

        await expect.element(screen.getByText("No se pudo imprimir el ticket")).toBeVisible();
        await expect
          .element(screen.getByRole("button", { name: "Cambiar impresora" }))
          .not.toBeInTheDocument();
      },
    );

    it("does not offer it while the receipt prints", async () => {
      const { screen } = await renderModal(CASH, {
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
    const FISCAL = (authorization: "real_time" | "offline_code"): Comprobante => ({
      kind: "fiscal",
      document_type: "factura_c",
      authorization,
      point_of_sale: 8,
      number: 412,
    });

    it("shows the contingency mode and lists the factura C for the customer while it prints", async () => {
      const { screen } = await renderModal(CASH, {
        readReceiptStatus: async () => found("printing", { comprobante: FISCAL("offline_code") }),
      });

      await expect.element(screen.getByText("Modo fiscal")).toBeVisible();
      await expect.element(screen.getByText("Contingencia con CAEA")).toBeVisible();
      await expect.element(screen.getByText("Factura C", { exact: true })).toBeVisible();
      await expect.element(screen.getByText("Para el cliente")).toBeVisible();
      await expect.element(screen.getByText("Imprimiendo")).toBeVisible();
      await expect.element(screen.getByText("Ticket", { exact: true })).not.toBeInTheDocument();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("shows the document as printed once it was", async () => {
      const { screen } = await renderModal(CASH, {
        readReceiptStatus: async () =>
          found("printed", { printed: true, comprobante: FISCAL("offline_code") }),
      });

      await expect.element(screen.getByText("Impreso")).toBeVisible();
      await expect.element(screen.getByText("Contingencia con CAEA")).toBeVisible();
    });

    it("shows the online mode for a factura C authorized in real time", async () => {
      const { screen } = await renderModal(CASH, {
        readReceiptStatus: async () =>
          found("printed", { printed: true, comprobante: FISCAL("real_time") }),
      });

      await expect.element(screen.getByText("En línea con CAE")).toBeVisible();
      await expect.element(screen.getByText("Contingencia con CAEA")).not.toBeInTheDocument();
    });

    it("keeps the ticket row for a deferred sale's non-fiscal document", async () => {
      const { screen } = await renderModal(CASH, {
        readReceiptStatus: async () =>
          found("printed", { printed: true, comprobante: { kind: "deferred_non_fiscal" } }),
      });

      await expect.element(screen.getByText("Ticket", { exact: true })).toBeVisible();
      await expect.element(screen.getByText("Modo fiscal")).not.toBeInTheDocument();
    });

    it("keeps the ticket row for a sale with no comprobante", async () => {
      const { screen } = await renderModal(CASH);

      await expect.element(screen.getByText("Ticket", { exact: true })).toBeVisible();
      await expect.element(screen.getByText("Modo fiscal")).not.toBeInTheDocument();
    });
  });
});
