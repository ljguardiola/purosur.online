import type {
  Authorization,
  CashBalance,
  ConvertPaidOrderIntoRefundOutcome,
  PrintOriginalReceiptOutcome,
  ReprintSaleReceiptOutcome,
  StartupPending,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import type { SignedInPerson } from "../shell/signed-in-person";
import { render } from "../shell/test-support/render-with-router";
import { StartupPendingScreen } from "./startup-pending-screen";

const CASHIER: SignedInPerson = {
  user_id: "u1",
  first_name: "Ada",
  abilities: ["reprint_receipt"],
};
const OWNER: SignedInPerson = { user_id: "u2", first_name: "Grace", abilities: [] };
const OPENED_AT = "2026-09-30T09:02:00.000-03:00";
const BALANCE: CashBalance = {
  opening_float: { amount: 2_000_000, direction: "in" },
  cash_sales: { amount: 0, direction: "in" },
  change_given: { amount: 0, direction: "out" },
  refunds: { amount: 0, direction: "out" },
  cash_in: { amount: 0, direction: "in" },
  expenses: { amount: 0, direction: "out" },
  withdrawals: { amount: 0, direction: "out" },
  expected: 2_000_000,
};

const NOTHING: StartupPending = {
  sales_to_print: [],
  unknown_fiscal_documents: [],
  pending_payments: [],
  paid_orders_without_sale: [],
  paid_order_discovery: "checked",
  selling_blocked: false,
};
const NEVER_PRINTED: StartupPending["sales_to_print"][number] = {
  sale_id: "sale-1",
  completed_at: "2026-09-30T10:15:00.000-03:00",
  total: 123_450,
  standing: "never_printed",
};
const OUTCOME_UNKNOWN: StartupPending["sales_to_print"][number] = {
  sale_id: "sale-2",
  completed_at: "2026-09-30T11:40:00.000-03:00",
  total: 98_000,
  standing: "outcome_unknown",
};
const UNKNOWN_DOCUMENT: StartupPending["unknown_fiscal_documents"][number] = {
  id: "doc-1",
  sale_id: "sale-3",
  completed_at: "2026-09-30T12:05:00.000-03:00",
  total: 50_000,
};
const ANOTHER_NEVER_PRINTED: StartupPending["sales_to_print"][number] = {
  sale_id: "sale-9",
  completed_at: "2026-09-30T10:30:00.000-03:00",
  total: 20_000,
  standing: "never_printed",
};
const QR_PAYMENT: StartupPending["pending_payments"][number] = {
  payment_id: "pay-1",
  sale_id: "sale-4",
  method: "QR",
  amount: 80_000,
  occurred_at: "2026-09-30T12:30:00.000-03:00",
};
const POINT_PAYMENT: StartupPending["pending_payments"][number] = {
  payment_id: "pay-2",
  sale_id: "sale-5",
  method: "POINT",
  amount: 45_550,
  occurred_at: "2026-09-30T12:45:00.000-03:00",
};

const QR_PAID_ORDER: StartupPending["paid_orders_without_sale"][number] = {
  payment_transaction_id: "tx-1",
  sale_id: "sale-7",
  method: "QR",
  amount: 80_000,
  created_at: "2026-09-30T15:30:00.000-03:00",
};
const POINT_PAID_ORDER: StartupPending["paid_orders_without_sale"][number] = {
  payment_transaction_id: "tx-2",
  sale_id: "sale-8",
  method: "POINT",
  amount: 45_550,
  created_at: "2026-09-30T15:45:00.000-03:00",
};
const BLOCKED_BY_QR: StartupPending = {
  ...NOTHING,
  paid_orders_without_sale: [QR_PAID_ORDER],
  selling_blocked: true,
};
const SELLING_BLOCKED_REASON = "Pasá el cobro a reembolso para empezar a vender.";

type Overrides = {
  person?: SignedInPerson;
  loadStartupPending?: () => Promise<StartupPending | "not_permitted">;
  loadCashBalance?: () => Promise<CashBalance | null | "unavailable">;
  printOriginalReceipt?: (saleId: string) => Promise<PrintOriginalReceiptOutcome>;
  reprintSaleReceipt?: (
    saleId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  convertPaidOrderIntoRefund?: (
    paymentTransactionId: string,
  ) => Promise<ConvertPaidOrderIntoRefundOutcome>;
  registerName?: string | null;
};

async function renderScreen(overrides: Overrides = {}) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  const loadStartupPending = vi.fn(
    overrides.loadStartupPending ?? (async () => ({ ...NOTHING, sales_to_print: [NEVER_PRINTED] })),
  );
  const printOriginalReceipt = vi.fn(
    overrides.printOriginalReceipt ??
      (async (): Promise<PrintOriginalReceiptOutcome> => ({
        kind: "started",
        copy: { kind: "original" },
      })),
  );
  const reprintSaleReceipt = vi.fn(
    overrides.reprintSaleReceipt ??
      (async (): Promise<ReprintSaleReceiptOutcome> => ({
        kind: "started",
        copy: { kind: "original" },
      })),
  );
  const convertPaidOrderIntoRefund = vi.fn(
    overrides.convertPaidOrderIntoRefund ??
      (async (): Promise<ConvertPaidOrderIntoRefundOutcome> => ({ kind: "converted" })),
  );
  const onGoSelling = vi.fn();
  const onSessionInvalid = vi.fn();
  const screen = await render(
    <StartupPendingScreen
      sessionId="s1"
      person={overrides.person ?? CASHIER}
      sessionOwner={OWNER}
      openedAt={OPENED_AT}
      registerName={overrides.registerName === undefined ? "Caja 1" : overrides.registerName}
      lock={() => {}}
      loadStartupPending={loadStartupPending}
      loadCashBalance={overrides.loadCashBalance ?? (async () => BALANCE)}
      printOriginalReceipt={printOriginalReceipt}
      reprintSaleReceipt={reprintSaleReceipt}
      convertPaidOrderIntoRefund={convertPaidOrderIntoRefund}
      loadAuthorizers={async () => []}
      onGoSelling={onGoSelling}
      onSessionInvalid={onSessionInvalid}
    />,
  );
  return {
    screen,
    loadStartupPending,
    printOriginalReceipt,
    reprintSaleReceipt,
    convertPaidOrderIntoRefund,
    onGoSelling,
    onSessionInvalid,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("StartupPendingScreen", () => {
  it("is headed Hay cosas para resolver, naming the register before starting", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("heading", { name: "Hay cosas para resolver", exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText("Caja 1 · Antes de empezar")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "La caja se cerró sin terminar algunas operaciones. Esto es lo que quedó.",
        ),
      )
      .toBeVisible();
  });

  it("names only the moment when the register has no name", async () => {
    const { screen } = await renderScreen({ registerName: null });

    await expect.element(screen.getByText("Antes de empezar", { exact: true })).toBeVisible();
  });

  it("offers a sale never printed with its time and total, to print as the original", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("Venta sin ticket")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Venta de las 10:15 por $ 1.234,50. Nunca se imprimió: sale como ticket original.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: /^Imprimir el ticket/ })).toBeVisible();
  });

  it("offers a sale whose ticket may have come out only as a duplicate", async () => {
    const { screen } = await renderScreen({
      loadStartupPending: async () => ({ ...NOTHING, sales_to_print: [OUTCOME_UNKNOWN] }),
    });

    await expect.element(screen.getByText("Ticket sin confirmar")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Venta de las 11:40 por $ 980,00. Puede que el ticket haya salido: se reimprime como duplicado.",
        ),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /^Reimprimir como duplicado/ }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /^Imprimir el ticket/ }))
      .not.toBeInTheDocument();
  });

  it("shows a fiscal document being asked to ARCA as being consulted, with no action", async () => {
    const { screen } = await renderScreen({
      loadStartupPending: async () => ({
        ...NOTHING,
        unknown_fiscal_documents: [UNKNOWN_DOCUMENT],
      }),
    });

    await expect.element(screen.getByText("Factura de las 12:05")).toBeVisible();
    await expect
      .element(screen.getByText("Se está consultando a ARCA si quedó autorizada."))
      .toBeVisible();
    await expect.element(screen.getByText("Consultando")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /^Imprimir el ticket/ }))
      .not.toBeInTheDocument();
  });

  it("shows a pending QR payment and a pending Point payment as being consulted", async () => {
    const { screen } = await renderScreen({
      loadStartupPending: async () => ({
        ...NOTHING,
        pending_payments: [QR_PAYMENT, POINT_PAYMENT],
        paid_orders_without_sale: [],
        paid_order_discovery: "checked",
        selling_blocked: false,
      }),
    });

    await expect.element(screen.getByText("Cobro con QR sin confirmar")).toBeVisible();
    await expect
      .element(
        screen.getByText("$ 800,00 de la venta de las 12:30. Se está consultando a Mercado Pago."),
      )
      .toBeVisible();
    await expect.element(screen.getByText("Cobro con Point sin confirmar")).toBeVisible();
    await expect
      .element(
        screen.getByText("$ 455,50 de la venta de las 12:45. Se está consultando a Mercado Pago."),
      )
      .toBeVisible();
    await expect.element(screen.getByText("Consultando").first()).toBeVisible();
  });

  it("lists every kind of item together in one table", async () => {
    const { screen } = await renderScreen({
      loadStartupPending: async () => ({
        sales_to_print: [NEVER_PRINTED, OUTCOME_UNKNOWN],
        unknown_fiscal_documents: [UNKNOWN_DOCUMENT],
        pending_payments: [QR_PAYMENT],
        paid_orders_without_sale: [],
        paid_order_discovery: "checked",
        selling_blocked: false,
      }),
    });
    const table = screen.getByRole("table", { name: "Pendientes" });

    await expect.element(table.getByRole("row", { name: /Venta sin ticket/ })).toBeVisible();
    await expect.element(table.getByRole("row", { name: /Ticket sin confirmar/ })).toBeVisible();
    await expect.element(table.getByRole("row", { name: /Factura de las 12:05/ })).toBeVisible();
    await expect
      .element(table.getByRole("row", { name: /Cobro con QR sin confirmar/ }))
      .toBeVisible();
  });

  it("goes to selling from Ir a vender", async () => {
    const { screen, onGoSelling } = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Ir a vender" }));

    expect(onGoSelling).toHaveBeenCalledOnce();
  });

  it("keeps Ir a vender enabled while the pending items load", async () => {
    const reading = deferred<StartupPending>();
    const { screen, onGoSelling } = await renderScreen({
      loadStartupPending: () => reading.promise,
    });

    await expect.element(screen.getByRole("button", { name: "Ir a vender" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Ir a vender" }));

    expect(onGoSelling).toHaveBeenCalledOnce();
  });

  it("fails to load with a retry that reads the items again, keeping Ir a vender enabled", async () => {
    const load = vi
      .fn<() => Promise<StartupPending | "not_permitted">>()
      .mockRejectedValueOnce(new Error("the core could not answer"))
      .mockResolvedValue({ ...NOTHING, sales_to_print: [NEVER_PRINTED] });
    const { screen } = await renderScreen({ loadStartupPending: load });

    await expect.element(screen.getByRole("button", { name: "Ir a vender" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(screen.getByText("Venta sin ticket")).toBeVisible();
  });

  it("says nothing is left once every item has been resolved", async () => {
    const { screen } = await renderScreen({ loadStartupPending: async () => NOTHING });

    await expect.element(screen.getByText("No queda nada pendiente")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Ir a vender" })).toBeEnabled();
  });

  it("names who opened the session, since when and with how much cash", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("Sesión abierta", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Grace", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Desde las 09:02 · fondo $ 20.000,00")).toBeVisible();
    await expect
      .element(screen.getByText("Lo que quedó pendiente se puede resolver después."))
      .toBeVisible();
  });

  it("gives only the opening time while the opening cash is unknown", async () => {
    const { screen } = await renderScreen({ loadCashBalance: async () => "unavailable" });

    await expect.element(screen.getByText("Desde las 09:02", { exact: true })).toBeVisible();
  });

  describe("printing the ticket of a sale never printed", () => {
    it("prints the original in one tap through its own request, with no dialog and no reason, and says it comes out when the printer is ready", async () => {
      const { screen, printOriginalReceipt, reprintSaleReceipt } = await renderScreen();

      await userEvent.click(screen.getByRole("button", { name: /^Imprimir el ticket/ }));

      expect(printOriginalReceipt).toHaveBeenCalledExactlyOnceWith("sale-1");
      await expect
        .element(screen.getByText("El ticket sale en cuanto la impresora esté lista"))
        .toBeVisible();
      await expect.element(screen.getByText("Sale como original.")).toBeVisible();
      await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
      expect(reprintSaleReceipt).not.toHaveBeenCalled();
    });

    it("reads the items again after printing and drops the item once the core no longer lists it", async () => {
      const load = vi
        .fn<() => Promise<StartupPending>>()
        .mockResolvedValueOnce({ ...NOTHING, sales_to_print: [NEVER_PRINTED] })
        .mockResolvedValue(NOTHING);
      const { screen } = await renderScreen({ loadStartupPending: load });

      await userEvent.click(screen.getByRole("button", { name: /^Imprimir el ticket/ }));

      await expect.element(screen.getByText("Venta sin ticket")).not.toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(2);
    });

    it("shows the sale as printing and sends no second request while the first is still being answered", async () => {
      const answer = deferred<PrintOriginalReceiptOutcome>();
      const print = vi.fn(() => answer.promise);
      const { screen } = await renderScreen({ printOriginalReceipt: print });

      await userEvent.click(screen.getByRole("button", { name: /^Imprimir el ticket/ }));
      await expect.element(screen.getByText("Imprimiendo")).toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: /^Imprimir el ticket/ }));

      expect(print).toHaveBeenCalledOnce();
    });

    it("keeps a sale printing while another sale's ticket is asked for", async () => {
      const first = deferred<PrintOriginalReceiptOutcome>();
      const second = deferred<PrintOriginalReceiptOutcome>();
      const print = vi.fn((saleId: string) => (saleId === "sale-1" ? first : second).promise);
      const { screen } = await renderScreen({
        loadStartupPending: async () => ({
          ...NOTHING,
          sales_to_print: [NEVER_PRINTED, ANOTHER_NEVER_PRINTED],
        }),
        printOriginalReceipt: print,
      });
      const firstSale = screen.getByRole("button", {
        name: "Imprimir el ticket de la venta de las 10:15",
      });
      const secondSale = screen.getByRole("button", {
        name: "Imprimir el ticket de la venta de las 10:30",
      });

      await userEvent.click(firstSale);
      await userEvent.click(secondSale);
      await userEvent.click(firstSale);

      expect(print.mock.calls).toEqual([["sale-1"], ["sale-9"]]);
    });

    it("offers the sale as an unconfirmed ticket when the core says its print was already attempted", async () => {
      const load = vi
        .fn<() => Promise<StartupPending>>()
        .mockResolvedValueOnce({ ...NOTHING, sales_to_print: [NEVER_PRINTED] })
        .mockResolvedValue({
          ...NOTHING,
          sales_to_print: [{ ...NEVER_PRINTED, standing: "outcome_unknown" }],
        });
      const { screen } = await renderScreen({
        loadStartupPending: load,
        printOriginalReceipt: async () => ({ kind: "already_attempted" }),
      });

      await userEvent.click(screen.getByRole("button", { name: /^Imprimir el ticket/ }));

      await expect.element(screen.getByText("Ticket sin confirmar")).toBeVisible();
      await expect
        .element(screen.getByText("El ticket sale en cuanto la impresora esté lista"))
        .not.toBeInTheDocument();
    });

    it("reads the items again when the core no longer finds the sale", async () => {
      const { screen, loadStartupPending } = await renderScreen({
        printOriginalReceipt: async () => ({ kind: "not_found" }),
      });

      await userEvent.click(screen.getByRole("button", { name: /^Imprimir el ticket/ }));

      await expect.poll(() => loadStartupPending.mock.calls.length).toBe(2);
    });

    it.each([
      [
        { kind: "busy" },
        "Esa venta ya se está imprimiendo",
        "Esperá a que termine antes de volver a imprimirla.",
      ],
      [
        { kind: "printer_not_configured" },
        "La impresora no está configurada",
        "Cargá su dirección en Impresora y después imprimí el ticket de nuevo.",
      ],
      [
        { kind: "lacks_permission" },
        "No tenés permiso para imprimir",
        "Pedile a quien pueda que imprima el ticket.",
      ],
      [{ kind: "unavailable" }, "No se pudo imprimir el ticket", "Probá de nuevo."],
    ] satisfies [PrintOriginalReceiptOutcome, string, string][])(
      "says why the ticket was not printed when the core answers %j",
      async (outcome, title, description) => {
        const { screen } = await renderScreen({ printOriginalReceipt: async () => outcome });

        await userEvent.click(screen.getByRole("button", { name: /^Imprimir el ticket/ }));

        await expect.element(screen.getByText(title)).toBeVisible();
        await expect.element(screen.getByText(description)).toBeVisible();
        await expect
          .element(screen.getByText("El ticket sale en cuanto la impresora esté lista"))
          .not.toBeInTheDocument();
      },
    );

    it("says the ticket could not be printed when the request itself fails", async () => {
      const { screen } = await renderScreen({
        printOriginalReceipt: async () => {
          throw new Error("the core could not answer");
        },
      });

      await userEvent.click(screen.getByRole("button", { name: /^Imprimir el ticket/ }));

      await expect.element(screen.getByText("No se pudo imprimir el ticket")).toBeVisible();
    });

    it("lets the person try again after a failure", async () => {
      const print = vi
        .fn<(saleId: string) => Promise<PrintOriginalReceiptOutcome>>()
        .mockResolvedValueOnce({ kind: "unavailable" })
        .mockResolvedValue({ kind: "started", copy: { kind: "original" } });
      const { screen } = await renderScreen({ printOriginalReceipt: print });
      await userEvent.click(screen.getByRole("button", { name: /^Imprimir el ticket/ }));
      await expect.element(screen.getByText("No se pudo imprimir el ticket")).toBeVisible();

      await userEvent.click(screen.getByRole("button", { name: /^Imprimir el ticket/ }));

      await expect
        .element(screen.getByText("El ticket sale en cuanto la impresora esté lista"))
        .toBeVisible();
      await expect
        .element(screen.getByText("No se pudo imprimir el ticket"))
        .not.toBeInTheDocument();
    });

    it("tells the route the session is no longer valid when the core finds nobody signed in", async () => {
      const { screen, onSessionInvalid } = await renderScreen({
        printOriginalReceipt: async () => ({ kind: "not_signed_in" }),
      });

      await userEvent.click(screen.getByRole("button", { name: /^Imprimir el ticket/ }));

      await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
    });
  });

  describe("reprinting the ticket of a sale whose print is unknown", () => {
    const UNKNOWN_ONLY = async () => ({ ...NOTHING, sales_to_print: [OUTCOME_UNKNOWN] });

    it("opens the reprint as a duplicate straight from the list, without a number it does not know", async () => {
      const { screen } = await renderScreen({ loadStartupPending: UNKNOWN_ONLY });

      await userEvent.click(screen.getByRole("button", { name: /^Reimprimir como duplicado/ }));

      await expect.element(screen.getByText("REIMPRIMIR VENTA DE LAS 11:40")).toBeVisible();
      await expect.element(screen.getByText("Sale como duplicado")).toBeVisible();
      await expect.element(screen.getByText(/COPIA DUPLICADA/)).not.toBeInTheDocument();
    });

    it("reprints through the reprint request with the reason typed, says it comes out when the printer is ready and reads the items again", async () => {
      const { screen, reprintSaleReceipt, printOriginalReceipt, loadStartupPending } =
        await renderScreen({
          loadStartupPending: UNKNOWN_ONLY,
          reprintSaleReceipt: async () => ({
            kind: "started",
            copy: { kind: "duplicate", order_number: 1 },
          }),
        });
      await userEvent.click(screen.getByRole("button", { name: /^Reimprimir como duplicado/ }));
      await userEvent.fill(
        screen.getByRole("textbox", { name: "Motivo de la reimpresión" }),
        "No se sabe si salió",
      );

      await userEvent.click(
        screen.getByRole("dialog").getByRole("button", { name: "Reimprimir duplicado" }),
      );

      expect(reprintSaleReceipt).toHaveBeenCalledExactlyOnceWith(
        "sale-2",
        "No se sabe si salió",
        undefined,
      );
      expect(printOriginalReceipt).not.toHaveBeenCalled();
      await expect
        .element(screen.getByText("El ticket sale en cuanto la impresora esté lista"))
        .toBeVisible();
      await expect
        .element(screen.getByText("REIMPRIMIR VENTA DE LAS 11:40"))
        .not.toBeInTheDocument();
      await expect.poll(() => loadStartupPending.mock.calls.length).toBe(2);
    });

    it("closes the reprint from Cancelar without asking the core to print", async () => {
      const { screen, reprintSaleReceipt } = await renderScreen({
        loadStartupPending: UNKNOWN_ONLY,
      });
      await userEvent.click(screen.getByRole("button", { name: /^Reimprimir como duplicado/ }));

      await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

      await expect
        .element(screen.getByText("REIMPRIMIR VENTA DE LAS 11:40"))
        .not.toBeInTheDocument();
      expect(reprintSaleReceipt).not.toHaveBeenCalled();
    });
  });

  describe("a paid order without a sale", () => {
    it("lists a paid QR order and a paid Point order above the other items, as blocking the sale", async () => {
      const { screen } = await renderScreen({
        loadStartupPending: async () => ({
          ...BLOCKED_BY_QR,
          sales_to_print: [NEVER_PRINTED],
          paid_orders_without_sale: [QR_PAID_ORDER, POINT_PAID_ORDER],
        }),
      });
      const rows = screen.getByRole("table", { name: "Pendientes" }).getByRole("row");

      await expect.element(rows.nth(1)).toHaveTextContent(/Cobro con QR pagado sin venta/);
      await expect.element(rows.nth(2)).toHaveTextContent(/Cobro con Point pagado sin venta/);
      await expect.element(rows.nth(3)).toHaveTextContent(/Venta sin ticket/);
      await expect
        .element(screen.getByText("$ 800,00 cobrados a las 15:30. La venta no quedó en la caja."))
        .toBeVisible();
      await expect.element(screen.getByText("Bloquea la venta").first()).toBeVisible();
    });

    it("disables Ir a vender and says why while the core blocks selling", async () => {
      const { screen, onGoSelling } = await renderScreen({
        loadStartupPending: async () => BLOCKED_BY_QR,
      });

      await expect.element(screen.getByText(SELLING_BLOCKED_REASON)).toBeVisible();
      await expect.element(screen.getByRole("button", { name: "Ir a vender" })).toBeDisabled();
      expect(onGoSelling).not.toHaveBeenCalled();
    });

    it("does not decide by itself that selling is blocked", async () => {
      const { screen } = await renderScreen({
        loadStartupPending: async () => ({ ...BLOCKED_BY_QR, selling_blocked: false }),
      });

      await expect.element(screen.getByText("Cobro con QR pagado sin venta")).toBeVisible();
      await expect.element(screen.getByRole("button", { name: "Ir a vender" })).toBeEnabled();
      await expect.element(screen.getByText(SELLING_BLOCKED_REASON)).not.toBeInTheDocument();
    });

    it("enables Ir a vender again once the core stops blocking selling", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const load = vi
        .fn<() => Promise<StartupPending>>()
        .mockResolvedValueOnce(BLOCKED_BY_QR)
        .mockResolvedValue(NOTHING);
      const { screen } = await renderScreen({ loadStartupPending: load });
      await expect.element(screen.getByRole("button", { name: "Ir a vender" })).toBeDisabled();

      await vi.advanceTimersByTimeAsync(3000);

      await expect.element(screen.getByRole("button", { name: "Ir a vender" })).toBeEnabled();
      await expect.element(screen.getByText(SELLING_BLOCKED_REASON)).not.toBeInTheDocument();
    });

    it("offers to pass the order to refund with a confirmation that names the payment", async () => {
      const { screen, convertPaidOrderIntoRefund } = await renderScreen({
        loadStartupPending: async () => BLOCKED_BY_QR,
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Pasar a reembolso el cobro de las 15:30" }),
      );

      const dialog = screen.getByRole("dialog", { name: "¿Pasar el cobro a reembolso?" });
      await expect.element(dialog).toBeVisible();
      expect(convertPaidOrderIntoRefund).not.toHaveBeenCalled();
      await userEvent.click(dialog.getByRole("button", { name: "Volver" }));
      await expect.element(dialog).not.toBeInTheDocument();
    });

    it("converts it on confirming, says so, and reads the items again so selling is allowed", async () => {
      const load = vi
        .fn<() => Promise<StartupPending>>()
        .mockResolvedValueOnce(BLOCKED_BY_QR)
        .mockResolvedValue(NOTHING);
      const { screen, convertPaidOrderIntoRefund } = await renderScreen({
        loadStartupPending: load,
      });
      await userEvent.click(
        screen.getByRole("button", { name: "Pasar a reembolso el cobro de las 15:30" }),
      );

      await userEvent.click(
        screen
          .getByRole("dialog", { name: "¿Pasar el cobro a reembolso?" })
          .getByRole("button", { name: "Pasar a reembolso" }),
      );

      expect(convertPaidOrderIntoRefund).toHaveBeenCalledExactlyOnceWith("tx-1");
      await expect.element(screen.getByText("El cobro quedó como reembolso")).toBeVisible();
      await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
      await expect.element(screen.getByText("No queda nada pendiente")).toBeVisible();
      await expect.element(screen.getByRole("button", { name: "Ir a vender" })).toBeEnabled();
    });

    it("closes the confirmation and reads the items again when the core no longer finds the order", async () => {
      const load = vi
        .fn<() => Promise<StartupPending>>()
        .mockResolvedValueOnce(BLOCKED_BY_QR)
        .mockResolvedValue(NOTHING);
      const { screen } = await renderScreen({
        loadStartupPending: load,
        convertPaidOrderIntoRefund: async () => ({ kind: "not_found" }),
      });
      await userEvent.click(
        screen.getByRole("button", { name: "Pasar a reembolso el cobro de las 15:30" }),
      );

      await userEvent.click(
        screen
          .getByRole("dialog", { name: "¿Pasar el cobro a reembolso?" })
          .getByRole("button", { name: "Pasar a reembolso" }),
      );

      await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
      await expect.element(screen.getByText("No queda nada pendiente")).toBeVisible();
    });

    it("tells the route the session is no longer valid when the core finds nobody signed in", async () => {
      const { screen, onSessionInvalid } = await renderScreen({
        loadStartupPending: async () => BLOCKED_BY_QR,
        convertPaidOrderIntoRefund: async () => ({ kind: "not_signed_in" }),
      });
      await userEvent.click(
        screen.getByRole("button", { name: "Pasar a reembolso el cobro de las 15:30" }),
      );

      await userEvent.click(
        screen
          .getByRole("dialog", { name: "¿Pasar el cobro a reembolso?" })
          .getByRole("button", { name: "Pasar a reembolso" }),
      );

      expect(onSessionInvalid).toHaveBeenCalledOnce();
    });

    it("keeps the order listed when the cloud cannot be reached", async () => {
      const { screen } = await renderScreen({
        loadStartupPending: async () => BLOCKED_BY_QR,
        convertPaidOrderIntoRefund: async () => ({ kind: "unreachable" }),
      });
      await userEvent.click(
        screen.getByRole("button", { name: "Pasar a reembolso el cobro de las 15:30" }),
      );

      await userEvent.click(
        screen
          .getByRole("dialog", { name: "¿Pasar el cobro a reembolso?" })
          .getByRole("button", { name: "Pasar a reembolso" }),
      );

      await expect
        .element(screen.getByText("No hay conexión con la nube. Probá de nuevo cuando vuelva.").first())
        .toBeVisible();
      await expect.element(screen.getByRole("button", { name: "Ir a vender" })).toBeDisabled();
    });

    it("has no accessibility violations", async () => {
      const { screen } = await renderScreen({
        loadStartupPending: async () => ({
          ...BLOCKED_BY_QR,
          sales_to_print: [NEVER_PRINTED],
          paid_order_discovery: "deferred",
        }),
      });
      await expect.element(screen.getByText("Cobro con QR pagado sin venta")).toBeVisible();

      await expectNoAccessibilityViolations(screen.container);
    });
  });

  describe("the search for paid orders without a sale", () => {
    const WARNING =
      "Puede haber un cobro pagado para esta caja sin venta. La caja lo va a consultar cuando vuelva la conexión.";

    it("warns, without blocking, when the search was deferred for lack of connection", async () => {
      const { screen, onGoSelling } = await renderScreen({
        loadStartupPending: async () => ({ ...NOTHING, paid_order_discovery: "deferred" }),
      });

      await expect.element(screen.getByText(WARNING)).toBeVisible();
      await expect.element(screen.getByText("Sin consultar")).toBeVisible();
      await expect.element(screen.getByRole("button", { name: "Ir a vender" })).toBeEnabled();
      await userEvent.click(screen.getByRole("button", { name: "Ir a vender" }));
      expect(onGoSelling).toHaveBeenCalledOnce();
    });

    it("warns when it is still pending and nothing else is known", async () => {
      const { screen } = await renderScreen({
        loadStartupPending: async () => ({ ...NOTHING, paid_order_discovery: "pending" }),
      });

      await expect.element(screen.getByText(WARNING)).toBeVisible();
    });

    it("says nothing once the search found nothing", async () => {
      const { screen } = await renderScreen({
        loadStartupPending: async () => ({ ...NOTHING, sales_to_print: [NEVER_PRINTED] }),
      });

      await expect.element(screen.getByText("Venta sin ticket")).toBeVisible();
      await expect.element(screen.getByText(WARNING)).not.toBeInTheDocument();
    });
  });

  describe("while items are being resolved", () => {
    it("reads the items again every few seconds and drops what was resolved, then stops", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const load = vi
        .fn<() => Promise<StartupPending>>()
        .mockResolvedValueOnce({
          ...NOTHING,
          unknown_fiscal_documents: [UNKNOWN_DOCUMENT],
          pending_payments: [QR_PAYMENT],
        })
        .mockResolvedValueOnce({ ...NOTHING, pending_payments: [QR_PAYMENT] })
        .mockResolvedValue(NOTHING);
      const { screen } = await renderScreen({ loadStartupPending: load });
      await expect.element(screen.getByText("Factura de las 12:05")).toBeVisible();

      await vi.advanceTimersByTimeAsync(3000);

      await expect.element(screen.getByText("Factura de las 12:05")).not.toBeInTheDocument();
      await expect.element(screen.getByText("Cobro con QR sin confirmar")).toBeVisible();
      await vi.advanceTimersByTimeAsync(3000);
      await expect.element(screen.getByText("No queda nada pendiente")).toBeVisible();
      const reads = load.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10_000);
      expect(load).toHaveBeenCalledTimes(reads);
    });
  });

  it("has no accessibility violations", async () => {
    const { screen } = await renderScreen({
      loadStartupPending: async () => ({
        sales_to_print: [NEVER_PRINTED, OUTCOME_UNKNOWN],
        unknown_fiscal_documents: [UNKNOWN_DOCUMENT],
        pending_payments: [QR_PAYMENT, POINT_PAYMENT],
        paid_orders_without_sale: [],
        paid_order_discovery: "checked",
        selling_blocked: false,
      }),
    });
    await expect.element(screen.getByText("Venta sin ticket")).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });
});
