import type { ReceiptPrintStatusOutcome, RetryReceiptPrintOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { SaleCompletedModal } from "./sale-completed-modal";

afterEach(() => {
  vi.useRealTimers();
});

type Standing = Extract<ReceiptPrintStatusOutcome, { kind: "found" }>["standing"];

function found(standing: Standing, { printed = false } = {}): ReceiptPrintStatusOutcome {
  return { kind: "found", next_copy: { kind: "original" }, printed, standing };
}

type Amounts =
  | { total: number; tendered: number; change: number }
  | { total: number; method: "TRANSFER"; amount: number };

type Overrides = {
  readReceiptStatus?: () => Promise<ReceiptPrintStatusOutcome>;
  retryReceiptPrint?: () => Promise<RetryReceiptPrintOutcome>;
};

async function renderModal(amounts: Amounts, overrides: Overrides = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const onNewSale = vi.fn();
  const readReceiptStatus = vi.fn(
    overrides.readReceiptStatus ?? (async () => found(null, { printed: true })),
  );
  const retryReceiptPrint = vi.fn(
    overrides.retryReceiptPrint ??
      (async (): Promise<RetryReceiptPrintOutcome> => ({
        kind: "started",
        copy: { kind: "original" },
      })),
  );
  const screen = await render(
    <SaleCompletedModal
      {...amounts}
      saleId="sale-1"
      readReceiptStatus={readReceiptStatus}
      retryReceiptPrint={retryReceiptPrint}
      onNewSale={onNewSale}
    />,
  );
  return { screen, onNewSale, readReceiptStatus, retryReceiptPrint };
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
      help: "Poné un rollo nuevo y cerrá la tapa. El ticket ya enviado queda en la impresora y sale solo cuando se resuelve. No hace falta reimprimir.",
    },
    {
      standing: "cover_open",
      state: "Tapa abierta",
      title: "La tapa de la impresora está abierta",
      help: "Cerrala. El ticket ya enviado queda en la impresora y sale solo cuando se resuelve. No hace falta reimprimir.",
    },
    {
      standing: "not_responding",
      state: "No responde",
      title: "La impresora no responde",
      help: "Revisá que esté encendida y con el cable conectado. Si vuelve a responder y el ticket no sale, se ofrece reintentar.",
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

  it("offers retrying when the printer answers again without confirming the print, and asks the core to retry", async () => {
    let standing: Standing = "retry_offered";
    const { screen, retryReceiptPrint } = await renderModal(CASH, {
      readReceiptStatus: async () => found(standing),
      retryReceiptPrint: async () => {
        standing = "printing";
        return { kind: "started", copy: { kind: "original" } };
      },
    });

    await expect.element(screen.getByText("Normal · sin confirmar la impresión")).toBeVisible();
    await expectAlertText(
      screen,
      "El ticket no salió La impresora volvió a responder pero no confirmó la impresión. El reintento sale como original.",
    );

    await userEvent.click(screen.getByRole("button", { name: "Reintentar impresión" }));

    expect(retryReceiptPrint).toHaveBeenCalledWith("sale-1");
    await expect.element(screen.getByText("Imprimiendo")).toBeVisible();
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  });

  it("says the retry comes out as a duplicate with its reprint number, because the ticket was already sent, when the core says the next copy is one", async () => {
    const { screen } = await renderModal(CASH, {
      readReceiptStatus: async () => ({
        kind: "found",
        next_copy: { kind: "duplicate", order_number: 2 },
        printed: false,
        standing: "retry_offered",
      }),
    });

    await expectAlertText(
      screen,
      "La impresora volvió a responder pero no confirmó la impresión. Como el ticket ya se había enviado, el reintento sale como duplicado, con la reimpresión Nº 2.",
    );
  });

  it("lets the cashier go on selling from the retry layout", async () => {
    const { screen, onNewSale } = await renderModal(CASH, {
      readReceiptStatus: async () => found("retry_offered"),
    });

    await userEvent.click(screen.getByRole("button", { name: "Seguir vendiendo" }));

    expect(onNewSale).toHaveBeenCalledOnce();
  });

  it.each([
    {
      outcome: { kind: "lacks_permission" } as const,
      notice: "No tenés permiso para reintentar la impresión.",
    },
    {
      outcome: { kind: "unavailable" } as const,
      notice: "No se pudo reintentar la impresión. Probá de nuevo.",
    },
  ])("tells the retry was refused: $outcome.kind", async ({ outcome, notice }) => {
    const { screen } = await renderModal(CASH, {
      readReceiptStatus: async () => found("retry_offered"),
      retryReceiptPrint: async () => outcome,
    });

    await userEvent.click(screen.getByRole("button", { name: "Reintentar impresión" }));

    await expect.element(screen.getByRole("alert").filter({ hasText: notice })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Reintentar impresión" }))
      .toBeEnabled();
  });

  it("drops the advice to try again once the retry it refused leaves the print failed, with no retry to try", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let standing: Standing = "retry_offered";
    const { screen } = await renderModal(CASH, {
      readReceiptStatus: async () => found(standing),
      retryReceiptPrint: async () => {
        standing = "failed";
        return { kind: "unavailable" };
      },
    });
    const retryNotice = screen
      .getByRole("alert")
      .filter({ hasText: "No se pudo reintentar la impresión. Probá de nuevo." });
    await userEvent.click(screen.getByRole("button", { name: "Reintentar impresión" }));
    await expect.element(retryNotice).toBeVisible();

    await vi.advanceTimersByTimeAsync(2000);

    await expect
      .element(
        screen.getByRole("alert").filter({ hasText: "Imprimilo desde el historial de ventas." }),
      )
      .toBeVisible();
    await expect.element(retryNotice).not.toBeInTheDocument();
  });

  it("tells the retry failed when the core cannot be reached", async () => {
    const { screen } = await renderModal(CASH, {
      readReceiptStatus: async () => found("retry_offered"),
      retryReceiptPrint: () => Promise.reject(new Error("the connection was replaced")),
    });

    await userEvent.click(screen.getByRole("button", { name: "Reintentar impresión" }));

    await expect
      .element(
        screen
          .getByRole("alert")
          .filter({ hasText: "No se pudo reintentar la impresión. Probá de nuevo." }),
      )
      .toBeVisible();
  });
});
