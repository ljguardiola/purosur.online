import type {
  Authorization,
  CashBalance,
  ConvertPaidOrderIntoRefundOutcome,
  PrintOriginalReceiptOutcome,
  RebuildSaleAgainstPaidOrderOutcome,
  ReprintSaleReceiptOutcome,
  StartupPending,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { notifyManager } from "@tanstack/react-query";
import type {} from "@vitest/browser-playwright";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import type { RegisterStatusData } from "../shell/register-status-context";
import { RegisterStatusProvider } from "../shell/register-status-context";
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
const REGISTER_STATUS: RegisterStatusData = {
  person: CASHIER,
  registerName: "Caja 1",
  cashSession: { status: "open", id: "s1", openedAt: OPENED_AT, openedBy: OWNER, locked: false },
  status: { status: "loading" },
  backupTickets: { status: "loading" },
  onDiscardBackupTickets: () => {},
};
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
  may_go_selling: true,
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
  rebuilt_sale_id: null,
};
const POINT_PAID_ORDER: StartupPending["paid_orders_without_sale"][number] = {
  payment_transaction_id: "tx-2",
  sale_id: "sale-8",
  method: "POINT",
  amount: 45_550,
  created_at: "2026-09-30T15:45:00.000-03:00",
  rebuilt_sale_id: null,
};
const BLOCKED_BY_QR: StartupPending = {
  ...NOTHING,
  paid_orders_without_sale: [QR_PAID_ORDER],
  selling_blocked: true,
  may_go_selling: false,
};
const SELLING_BLOCKED_REASON = "Pasá el cobro a reembolso para empezar a vender.";
const CHECKING_REASON = "Esperá a que la caja termine de consultar los cobros pagados.";

function goSelling(screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) {
  return screen.getByRole("button", { name: "Ir a vender" });
}

// React Aria opens a tooltip only after a real pointer move; a hover's enter event can fire
// before that move and is then silently dropped, so this throwaway move supplies it.
async function hoverGoSelling(screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) {
  await cdp().send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  await userEvent.hover(goSelling(screen));
}

async function expectGoSellingLocked(screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) {
  await expect.element(goSelling(screen)).toHaveAttribute("aria-disabled", "true");
}

async function expectGoSellingOpen(screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) {
  await expect.element(goSelling(screen)).toBeEnabled();
  await expect.element(goSelling(screen)).not.toHaveAttribute("aria-disabled");
}

async function press(
  screen: Awaited<ReturnType<typeof renderScreen>>["screen"],
  key: string,
  listed: string,
) {
  await expect.element(screen.getByText(listed)).toBeVisible();
  await userEvent.keyboard(key);
}

function rowsOfTable(screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) {
  return screen.getByRole("table", { name: "Pendientes" }).getByRole("row");
}

const MIXED_PENDING: StartupPending = {
  ...NOTHING,
  sales_to_print: [NEVER_PRINTED],
  unknown_fiscal_documents: [UNKNOWN_DOCUMENT],
  paid_orders_without_sale: [QR_PAID_ORDER],
};

function legendOf() {
  return Array.from(document.querySelectorAll("main ul li"), (item) => item.textContent);
}

function freezeTimersKeepingQueriesAnswered() {
  notifyManager.setScheduler(queueMicrotask);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  onTestFinished(() => {
    vi.useRealTimers();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  });
}

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
  rebuildSaleAgainstPaidOrder?: (
    paymentTransactionId: string,
  ) => Promise<RebuildSaleAgainstPaidOrderOutcome>;
  clockGuard?: ReactNode;
};

async function renderScreen(overrides: Overrides = {}) {
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
  const rebuildSaleAgainstPaidOrder = vi.fn(
    overrides.rebuildSaleAgainstPaidOrder ??
      (async (): Promise<RebuildSaleAgainstPaidOrderOutcome> => ({
        kind: "rebuilt",
        sale_id: "sale-new",
      })),
  );
  const onGoSelling = vi.fn();
  const onGoToSale = vi.fn();
  const onNothingLeft = vi.fn();
  const onSessionInvalid = vi.fn();
  const screen = await render(
    <RegisterStatusProvider value={REGISTER_STATUS}>
      <StartupPendingScreen
        sessionId="s1"
        person={overrides.person ?? CASHIER}
        sessionOwner={OWNER}
        openedAt={OPENED_AT}
        lock={() => {}}
        loadStartupPending={loadStartupPending}
        loadCashBalance={overrides.loadCashBalance ?? (async () => BALANCE)}
        printOriginalReceipt={printOriginalReceipt}
        reprintSaleReceipt={reprintSaleReceipt}
        convertPaidOrderIntoRefund={convertPaidOrderIntoRefund}
        rebuildSaleAgainstPaidOrder={rebuildSaleAgainstPaidOrder}
        loadAuthorizers={async () => []}
        clockGuard={overrides.clockGuard}
        onGoSelling={onGoSelling}
        onGoToSale={onGoToSale}
        onNothingLeft={onNothingLeft}
        onSessionInvalid={onSessionInvalid}
      />
    </RegisterStatusProvider>,
  );
  return {
    screen,
    loadStartupPending,
    printOriginalReceipt,
    reprintSaleReceipt,
    convertPaidOrderIntoRefund,
    rebuildSaleAgainstPaidOrder,
    onGoSelling,
    onGoToSale,
    onNothingLeft,
    onSessionInvalid,
  };
}

beforeAll(async () => {
  await page.viewport(1280, 720);
});

afterAll(async () => {
  await page.viewport(414, 896);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StartupPendingScreen", () => {
  it("shows what it is given for the clock guard among the pending items, and still lets the person go selling", async () => {
    const { screen } = await renderScreen({ clockGuard: <p>Aviso del reloj</p> });

    await expect.element(screen.getByText("Aviso del reloj")).toBeVisible();
    await expectGoSellingOpen(screen);
  });

  it("names the step Antes de empezar as the header's last crumb, with no heading of its own", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("region", { name: "Estado de la caja" }))
      .toMatchTextContent(/^CAJA 1•Ada•Antes de empezar/);
    await expect.element(screen.getByText("Venta sin ticket")).toBeVisible();
    expect(screen.getByRole("main").getByRole("heading").elements()).toEqual([]);
    await expect
      .element(
        screen.getByText(
          "La caja se cerró sin terminar algunas operaciones. Esto es lo que quedó.",
        ),
      )
      .not.toBeInTheDocument();
  });

  it("stretches the table down the main area, with its key legend pinned at the bottom", async () => {
    const { screen } = await renderScreen({
      loadStartupPending: async () => ({ ...NOTHING, sales_to_print: [NEVER_PRINTED] }),
    });
    await expect.element(screen.getByText("Venta sin ticket")).toBeVisible();

    const main = screen.getByRole("main").element().getBoundingClientRect();
    const header = screen
      .getByRole("region", { name: "Estado de la caja" })
      .element()
      .getBoundingClientRect();
    const card = screen.getByRole("table", { name: "Pendientes" }).element().closest("div.border");
    const legend = document.querySelector("main ul");
    const cardBox = card?.getBoundingClientRect();
    expect(cardBox?.bottom).toBeCloseTo(main.bottom - 24, 0);
    expect(cardBox?.top).toBeCloseTo(header.bottom + 16, 0);
    expect(legend?.getBoundingClientRect().bottom).toBeLessThanOrEqual(cardBox?.bottom ?? 0);
    expect((cardBox?.bottom ?? 0) - (legend?.getBoundingClientRect().bottom ?? 0)).toBeLessThan(20);
  });

  it("titles each row in bold and keeps its description on one line, with the state narrow at the right end", async () => {
    const { screen } = await renderScreen({
      loadStartupPending: async () => ({ ...NOTHING, sales_to_print: [NEVER_PRINTED] }),
    });
    const title = screen.getByText("Venta sin ticket", { exact: true });
    await expect.element(title).toBeVisible();
    const description = screen.getByText(/Nunca se imprimió/).element();
    const lineHeight = Number.parseFloat(getComputedStyle(description).lineHeight);
    expect(getComputedStyle(title.element()).fontWeight).toBe("700");
    expect(description.getBoundingClientRect().height).toBeLessThanOrEqual(lineHeight + 1);

    const state = screen.getByRole("columnheader", { name: "Estado" }).element();
    const table = screen.getByRole("table", { name: "Pendientes" }).element();
    expect(state.getBoundingClientRect().width).toBeLessThanOrEqual(200);
    expect(state.getBoundingClientRect().right).toBeCloseTo(table.getBoundingClientRect().right, 0);
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
    await expect.poll(legendOf).toEqual(["↑↓Pendientes", "PImprimir"]);
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
    await expect.poll(legendOf).toEqual(["↑↓Pendientes", "PImprimir"]);
  });

  it("shows a fiscal document being asked to ARCA as being consulted, with no action", async () => {
    const { screen, printOriginalReceipt } = await renderScreen({
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
    await expect.poll(legendOf).toEqual(["↑↓Pendientes"]);
    await userEvent.keyboard("p");
    expect(printOriginalReceipt).not.toHaveBeenCalled();
  });

  it("shows a pending QR payment and a pending Point payment as being consulted", async () => {
    const { screen } = await renderScreen({
      loadStartupPending: async () => ({
        ...NOTHING,
        pending_payments: [QR_PAYMENT, POINT_PAYMENT],
        paid_orders_without_sale: [],
        paid_order_discovery: "checked",
        selling_blocked: false,
        may_go_selling: true,
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
        may_go_selling: true,
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

  it("goes to selling with Enter, the key Ir a vender shows", async () => {
    const { screen, onGoSelling } = await renderScreen();
    await expect.element(goSelling(screen).getByText("Enter", { exact: true })).toBeVisible();

    await userEvent.keyboard("{Enter}");

    expect(onGoSelling).toHaveBeenCalledOnce();
  });

  it("leaves Enter to a focused link of the rail instead of going selling", async () => {
    const { screen, onGoSelling } = await renderScreen();
    const cash = screen.getByRole("link", { name: "Caja" });
    await expect.element(cash).toBeVisible();

    (cash.element() as HTMLElement).focus();
    await userEvent.keyboard("{Enter}");

    await expect.poll(() => screen.router.state.location.pathname).toBe("/cash");
    expect(onGoSelling).not.toHaveBeenCalled();
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

  it("fails to load with an R retry that reads the items again, keeping Ir a vender enabled", async () => {
    const load = vi
      .fn<() => Promise<StartupPending | "not_permitted">>()
      .mockRejectedValueOnce(new Error("the core could not answer"))
      .mockResolvedValue({ ...NOTHING, sales_to_print: [NEVER_PRINTED] });
    const { screen } = await renderScreen({ loadStartupPending: load });

    await expect.element(screen.getByRole("button", { name: "Ir a vender" })).toBeEnabled();
    await expect.element(screen.getByText("Podés ir a vender igual.")).toBeVisible();
    await userEvent.keyboard("r");

    await expect.element(screen.getByText("Venta sin ticket")).toBeVisible();
  });

  it("tells the route nothing is left once the core lists nothing and the paid-order check is done, without going selling itself", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const load = vi
      .fn<() => Promise<StartupPending>>()
      .mockResolvedValueOnce({ ...NOTHING, sales_to_print: [NEVER_PRINTED] })
      .mockResolvedValue(NOTHING);
    const { screen, onGoSelling, onNothingLeft } = await renderScreen({
      loadStartupPending: load,
    });
    await expect.element(screen.getByText("Venta sin ticket")).toBeVisible();
    expect(onNothingLeft).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);

    await vi.waitFor(() => expect(onNothingLeft).toHaveBeenCalledOnce());
    expect(onGoSelling).not.toHaveBeenCalled();
  });

  it.each([
    ["a paid order blocks starting a sale", BLOCKED_BY_QR],
    ["a sale is left to print", { ...NOTHING, sales_to_print: [NEVER_PRINTED] }],
    ["a payment is still being confirmed", { ...NOTHING, pending_payments: [QR_PAYMENT] }],
    ["the paid-order check has not run yet", { ...NOTHING, paid_order_discovery: "pending" }],
    ["the paid-order check was deferred", { ...NOTHING, paid_order_discovery: "deferred" }],
  ] satisfies [string, StartupPending][])("stays while %s", async (_name, pending) => {
    const { screen, onGoSelling, onNothingLeft } = await renderScreen({
      loadStartupPending: async () => pending,
    });

    await expect
      .element(screen.getByRole("table", { name: "Pendientes" }).getByRole("row").nth(1))
      .toBeVisible();
    await expect.element(screen.getByText("No queda nada pendiente")).not.toBeInTheDocument();
    expect(onGoSelling).not.toHaveBeenCalled();
    expect(onNothingLeft).not.toHaveBeenCalled();
  });

  it("names who opened the session, since when and with how much opening cash", async () => {
    const { screen } = await renderScreen();
    const panel = screen.getByRole("complementary", { name: "Sesión abierta" });

    await expect.element(panel.getByText("Sesión abierta", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Abierta por", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Grace", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Desde las", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("09:02", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Fondo inicial", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("$ 20.000,00", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByText("Lo que quedó pendiente se puede resolver después."))
      .not.toBeInTheDocument();
  });

  it("gives only the opening time while the opening cash is unknown", async () => {
    const { screen } = await renderScreen({ loadCashBalance: async () => "unavailable" });
    const panel = screen.getByRole("complementary", { name: "Sesión abierta" });

    await expect.element(panel.getByText("09:02", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("Fondo inicial", { exact: true })).not.toBeInTheDocument();
  });

  describe("printing the ticket of a sale never printed", () => {
    it("prints the original in one tap through its own request, with no dialog and no reason, and says it comes out when the printer is ready", async () => {
      const { screen, printOriginalReceipt, reprintSaleReceipt } = await renderScreen();

      await press(screen, "p", "Venta sin ticket");

      expect(printOriginalReceipt).toHaveBeenCalledExactlyOnceWith("sale-1");
      await expect
        .element(screen.getByText("El ticket sale en cuanto la impresora esté lista"))
        .toBeVisible();
      await expect.element(screen.getByText("Sale como original.")).toBeVisible();
      await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
      expect(reprintSaleReceipt).not.toHaveBeenCalled();
    });

    it("keeps the printing notice on the screen for five seconds before telling the route nothing is left", async () => {
      const load = vi
        .fn<() => Promise<StartupPending>>()
        .mockResolvedValueOnce({ ...NOTHING, sales_to_print: [NEVER_PRINTED] })
        .mockResolvedValue(NOTHING);
      const { screen, onNothingLeft } = await renderScreen({ loadStartupPending: load });
      await expect.element(screen.getByText("Venta sin ticket")).toBeVisible();
      freezeTimersKeepingQueriesAnswered();

      await press(screen, "p", "Venta sin ticket");
      await expect
        .element(screen.getByText("El ticket sale en cuanto la impresora esté lista"))
        .toBeVisible();
      await vi.advanceTimersByTimeAsync(4999);
      await expect.element(screen.getByText("No queda nada pendiente")).toBeVisible();
      expect(onNothingLeft).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);

      await vi.waitFor(() => expect(onNothingLeft).toHaveBeenCalledOnce());
      await expect
        .element(screen.getByText("El ticket sale en cuanto la impresora esté lista"))
        .not.toBeInTheDocument();
    });

    it("reads the items again after printing and drops the item once the core no longer lists it", async () => {
      const load = vi
        .fn<() => Promise<StartupPending>>()
        .mockResolvedValueOnce({ ...NOTHING, sales_to_print: [NEVER_PRINTED] })
        .mockResolvedValue(NOTHING);
      const { screen } = await renderScreen({ loadStartupPending: load });

      await press(screen, "p", "Venta sin ticket");

      await expect.element(screen.getByText("Venta sin ticket")).not.toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(2);
    });

    it("shows the sale as printing and sends no second request while the first is still being answered", async () => {
      const answer = deferred<PrintOriginalReceiptOutcome>();
      const print = vi.fn(() => answer.promise);
      const { screen } = await renderScreen({ printOriginalReceipt: print });

      await press(screen, "p", "Venta sin ticket");
      await expect.element(screen.getByText("Imprimiendo")).toBeVisible();
      await press(screen, "p", "Venta sin ticket");

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
      const firstSale = screen.getByText(/^Venta de las 10:15/);
      const secondSale = screen.getByText(/^Venta de las 10:30/);
      await expect.element(firstSale).toBeVisible();

      await userEvent.keyboard("p");
      await userEvent.click(secondSale);
      await userEvent.keyboard("p");
      await userEvent.click(firstSale);
      await userEvent.keyboard("p");

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

      await press(screen, "p", "Venta sin ticket");

      await expect.element(screen.getByText("Ticket sin confirmar")).toBeVisible();
      await expect
        .element(screen.getByText("El ticket sale en cuanto la impresora esté lista"))
        .not.toBeInTheDocument();
    });

    it.each(["not_found", "sale_voided"] as const)(
      "reads the items again when the core answers %s",
      async (kind) => {
        const { screen, loadStartupPending } = await renderScreen({
          printOriginalReceipt: async () => ({ kind }),
        });

        await press(screen, "p", "Venta sin ticket");

        await expect.poll(() => loadStartupPending.mock.calls.length).toBe(2);
      },
    );

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

        await press(screen, "p", "Venta sin ticket");

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

      await press(screen, "p", "Venta sin ticket");

      await expect.element(screen.getByText("No se pudo imprimir el ticket")).toBeVisible();
    });

    it("lets the person try again after a failure", async () => {
      const print = vi
        .fn<(saleId: string) => Promise<PrintOriginalReceiptOutcome>>()
        .mockResolvedValueOnce({ kind: "unavailable" })
        .mockResolvedValue({ kind: "started", copy: { kind: "original" } });
      const { screen } = await renderScreen({ printOriginalReceipt: print });
      await press(screen, "p", "Venta sin ticket");
      await expect.element(screen.getByText("No se pudo imprimir el ticket")).toBeVisible();

      await press(screen, "p", "Venta sin ticket");

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

      await press(screen, "p", "Venta sin ticket");

      await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
    });
  });

  describe("reprinting the ticket of a sale whose print is unknown", () => {
    const unknownOnly = async () => ({ ...NOTHING, sales_to_print: [OUTCOME_UNKNOWN] });

    it("opens the reprint as a duplicate straight from the list, without a number it does not know", async () => {
      const { screen } = await renderScreen({ loadStartupPending: unknownOnly });

      await press(screen, "p", "Ticket sin confirmar");

      await expect.element(screen.getByText("REIMPRIMIR VENTA DE LAS 11:40")).toBeVisible();
      await expect.element(screen.getByText("Sale como duplicado")).toBeVisible();
      await expect.element(screen.getByText(/COPIA DUPLICADA/)).not.toBeInTheDocument();
    });

    it("reprints through the reprint request with the reason typed, says it comes out when the printer is ready and reads the items again", async () => {
      const { screen, reprintSaleReceipt, printOriginalReceipt, loadStartupPending } =
        await renderScreen({
          loadStartupPending: unknownOnly,
          reprintSaleReceipt: async () => ({
            kind: "started",
            copy: { kind: "duplicate", order_number: 1 },
          }),
        });
      await press(screen, "p", "Ticket sin confirmar");
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
        loadStartupPending: unknownOnly,
      });
      await press(screen, "p", "Ticket sin confirmar");

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

      await expect.element(rows.nth(1).getByText("Cobro con QR pagado sin venta")).toBeVisible();
      await expect.element(rows.nth(2).getByText("Cobro con Point pagado sin venta")).toBeVisible();
      await expect.element(rows.nth(3).getByText("Venta sin ticket")).toBeVisible();
      await expect
        .element(screen.getByText("$ 800,00 cobrados a las 15:30. La venta no quedó en la caja."))
        .toBeVisible();
      await expect.element(screen.getByText("Bloquea la venta").first()).toBeVisible();
    });

    it("locks Ir a vender and its Enter while the core keeps the cashier from selling, saying why in a notice above it", async () => {
      const { screen, onGoSelling } = await renderScreen({
        loadStartupPending: async () => BLOCKED_BY_QR,
      });
      await expectGoSellingLocked(screen);

      await expect
        .element(screen.getByRole("complementary", { name: "Sesión abierta" }).getByRole("status"))
        .toHaveTextContent(SELLING_BLOCKED_REASON);
      goSelling(screen)
        .element()
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await userEvent.keyboard("{Enter}");
      expect(onGoSelling).not.toHaveBeenCalled();
    });

    it("lets the cashier go back to the sale left open while the paid order blocks starting another", async () => {
      const { screen, onGoSelling } = await renderScreen({
        loadStartupPending: async () => ({ ...BLOCKED_BY_QR, may_go_selling: true }),
      });
      await expect.element(screen.getByText("Bloquea la venta")).toBeVisible();
      await expectGoSellingOpen(screen);

      await userEvent.click(goSelling(screen));

      expect(onGoSelling).toHaveBeenCalledOnce();
    });

    it("shows the paid order as blocking the sale only when the core says selling is blocked", async () => {
      const { screen } = await renderScreen({
        loadStartupPending: async () => ({
          ...BLOCKED_BY_QR,
          selling_blocked: false,
          may_go_selling: true,
        }),
      });

      await expect.element(screen.getByText("Cobro con QR pagado sin venta")).toBeVisible();
      await expect.element(screen.getByText("Bloquea la venta")).not.toBeInTheDocument();
      await expectGoSellingOpen(screen);
    });

    it("enables Ir a vender again once the core stops keeping the cashier from selling", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const load = vi
        .fn<() => Promise<StartupPending>>()
        .mockResolvedValueOnce(BLOCKED_BY_QR)
        .mockResolvedValue(NOTHING);
      const { screen } = await renderScreen({ loadStartupPending: load });
      await expectGoSellingLocked(screen);

      await vi.advanceTimersByTimeAsync(3000);

      await expectGoSellingOpen(screen);
    });

    it("offers to pass the order to refund with a confirmation that names the payment", async () => {
      const { screen, convertPaidOrderIntoRefund } = await renderScreen({
        loadStartupPending: async () => BLOCKED_BY_QR,
      });

      await press(screen, "r", "Cobro con QR pagado sin venta");

      const panel = screen.getByRole("complementary", { name: "¿Pasar el cobro a reembolso?" });
      await expect.element(panel).toBeVisible();
      expect(convertPaidOrderIntoRefund).not.toHaveBeenCalled();
      await userEvent.keyboard("{Escape}");
      await expect.element(panel).not.toBeInTheDocument();
    });

    it("replaces the session panel while the confirmation is open and has no Volver", async () => {
      const { screen } = await renderScreen({ loadStartupPending: async () => BLOCKED_BY_QR });
      const session = screen.getByRole("complementary", { name: "Sesión abierta" });
      const sessionBox = session.element().getBoundingClientRect();
      await press(screen, "r", "Cobro con QR pagado sin venta");

      const panel = screen.getByRole("complementary", { name: "¿Pasar el cobro a reembolso?" });
      await expect.element(panel.getByText("Cobro con QR")).toBeVisible();
      await expect.element(panel.getByText("$ 800,00")).toBeVisible();
      await expect.element(panel.getByText("15:30")).toBeVisible();
      await expect.element(panel.getByText("Pasa a ser")).toBeVisible();
      await expect.element(panel.getByText("Reembolso pendiente")).toBeVisible();
      await expect.element(panel.getByRole("button", { name: "Volver" })).not.toBeInTheDocument();
      const covering = document.elementFromPoint(
        sessionBox.left + sessionBox.width / 2,
        sessionBox.top + sessionBox.height / 2,
      );
      expect(panel.element().contains(covering)).toBe(true);
      await expect.element(screen.getByText("Cobro con QR pagado sin venta")).toBeVisible();
    });

    it("confirms with Enter instead of going to sell while the confirmation is open", async () => {
      const { screen, convertPaidOrderIntoRefund, onGoSelling } = await renderScreen({
        loadStartupPending: async () => BLOCKED_BY_QR,
      });
      await press(screen, "r", "Cobro con QR pagado sin venta");
      await expect
        .element(screen.getByRole("complementary", { name: "¿Pasar el cobro a reembolso?" }))
        .toBeVisible();

      await userEvent.keyboard("{Enter}");

      await vi.waitFor(() =>
        expect(convertPaidOrderIntoRefund).toHaveBeenCalledExactlyOnceWith("tx-1"),
      );
      expect(onGoSelling).not.toHaveBeenCalled();
    });

    it("converts it on confirming, says so, and reads the items again so selling is allowed", async () => {
      const load = vi
        .fn<() => Promise<StartupPending>>()
        .mockResolvedValueOnce(BLOCKED_BY_QR)
        .mockResolvedValue(NOTHING);
      const { screen, convertPaidOrderIntoRefund } = await renderScreen({
        loadStartupPending: load,
      });
      await press(screen, "r", "Cobro con QR pagado sin venta");

      await userEvent.click(
        screen
          .getByRole("complementary", { name: "¿Pasar el cobro a reembolso?" })
          .getByRole("button", { name: "Pasar a reembolso" }),
      );

      expect(convertPaidOrderIntoRefund).toHaveBeenCalledExactlyOnceWith("tx-1");
      await expect.element(screen.getByText("El cobro quedó como reembolso")).toBeVisible();
      await expect
        .element(screen.getByRole("complementary", { name: "¿Pasar el cobro a reembolso?" }))
        .not.toBeInTheDocument();
      await expect.element(screen.getByText("No queda nada pendiente")).toBeVisible();
      await expectGoSellingOpen(screen);
    });

    it("keeps the refund notice on the screen for five seconds before telling the route nothing is left", async () => {
      const load = vi
        .fn<() => Promise<StartupPending>>()
        .mockResolvedValueOnce(BLOCKED_BY_QR)
        .mockResolvedValue(NOTHING);
      const { screen, onNothingLeft } = await renderScreen({ loadStartupPending: load });
      await press(screen, "r", "Cobro con QR pagado sin venta");
      const confirmation = screen.getByRole("complementary", {
        name: "¿Pasar el cobro a reembolso?",
      });
      await expect.element(confirmation).toBeVisible();
      freezeTimersKeepingQueriesAnswered();

      await userEvent.click(confirmation.getByRole("button", { name: "Pasar a reembolso" }));
      await expect.element(screen.getByText("El cobro quedó como reembolso")).toBeVisible();
      await vi.advanceTimersByTimeAsync(4999);
      await expect.element(screen.getByText("No queda nada pendiente")).toBeVisible();
      expect(onNothingLeft).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);

      await vi.waitFor(() => expect(onNothingLeft).toHaveBeenCalledOnce());
      await expect
        .element(screen.getByText("El cobro quedó como reembolso"))
        .not.toBeInTheDocument();
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
      await press(screen, "r", "Cobro con QR pagado sin venta");

      await userEvent.click(
        screen
          .getByRole("complementary", { name: "¿Pasar el cobro a reembolso?" })
          .getByRole("button", { name: "Pasar a reembolso" }),
      );

      await expect
        .element(screen.getByRole("complementary", { name: "¿Pasar el cobro a reembolso?" }))
        .not.toBeInTheDocument();
      await expect.element(screen.getByText("No queda nada pendiente")).toBeVisible();
    });

    it("tells the route the session is no longer valid when the core finds nobody signed in", async () => {
      const { screen, onSessionInvalid } = await renderScreen({
        loadStartupPending: async () => BLOCKED_BY_QR,
        convertPaidOrderIntoRefund: async () => ({ kind: "not_signed_in" }),
      });
      await press(screen, "r", "Cobro con QR pagado sin venta");

      await userEvent.click(
        screen
          .getByRole("complementary", { name: "¿Pasar el cobro a reembolso?" })
          .getByRole("button", { name: "Pasar a reembolso" }),
      );

      expect(onSessionInvalid).toHaveBeenCalledOnce();
    });

    it("keeps the order listed when the cloud cannot be reached", async () => {
      const { screen } = await renderScreen({
        loadStartupPending: async () => BLOCKED_BY_QR,
        convertPaidOrderIntoRefund: async () => ({ kind: "unreachable" }),
      });
      await press(screen, "r", "Cobro con QR pagado sin venta");

      await userEvent.click(
        screen
          .getByRole("complementary", { name: "¿Pasar el cobro a reembolso?" })
          .getByRole("button", { name: "Pasar a reembolso" }),
      );

      await expect
        .element(
          screen.getByText("No hay conexión con la nube. Probá de nuevo cuando vuelva.").first(),
        )
        .toBeVisible();
      await expectGoSellingLocked(screen);
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

  describe("rebuilding the sale of a paid order without a sale", () => {
    const REBUILT_QR: StartupPending = {
      ...BLOCKED_BY_QR,
      paid_orders_without_sale: [{ ...QR_PAID_ORDER, rebuilt_sale_id: "sale-new" }],
    };

    it("offers to rebuild the sale beside passing the order to refund", async () => {
      await renderScreen({ loadStartupPending: async () => BLOCKED_BY_QR });

      await expect
        .poll(legendOf)
        .toEqual(["↑↓Pendientes", "AArmar la venta", "RPasar a reembolso"]);
    });

    it.each([
      ["rebuilt", { kind: "rebuilt", sale_id: "sale-new" }],
      ["already_open", { kind: "already_open", sale_id: "sale-new" }],
    ] as const)(
      "asks the core for the order and goes to the sale on %s",
      async (_kind, outcome) => {
        const { screen, rebuildSaleAgainstPaidOrder, onGoToSale } = await renderScreen({
          loadStartupPending: async () => BLOCKED_BY_QR,
          rebuildSaleAgainstPaidOrder: async () => outcome,
        });

        await press(screen, "a", "Cobro con QR pagado sin venta");

        expect(rebuildSaleAgainstPaidOrder).toHaveBeenCalledExactlyOnceWith("tx-1");
        await vi.waitFor(() => expect(onGoToSale).toHaveBeenCalledOnce());
      },
    );

    it("sends one request while the first is still being answered", async () => {
      const answer = deferred<RebuildSaleAgainstPaidOrderOutcome>();
      const { screen, rebuildSaleAgainstPaidOrder } = await renderScreen({
        loadStartupPending: async () => BLOCKED_BY_QR,
        rebuildSaleAgainstPaidOrder: () => answer.promise,
      });
      await expect.element(screen.getByText("Cobro con QR pagado sin venta")).toBeVisible();

      await userEvent.keyboard("a");
      await userEvent.keyboard("a");
      answer.resolve({ kind: "rebuilt", sale_id: "sale-new" });

      await vi.waitFor(() => expect(rebuildSaleAgainstPaidOrder).toHaveBeenCalledOnce());
    });

    it.each([
      [
        { kind: "another_sale_open" },
        "Ya hay otra venta abierta",
        "Terminala o cancelala antes de armar la venta con este cobro.",
      ],
      [
        { kind: "card_type_unknown" },
        "Todavía falta el tipo de tarjeta de este cobro",
        "La caja lo consulta sola cuando hay conexión. Probá de nuevo más tarde o pasalo a reembolso.",
      ],
      [
        { kind: "not_permitted" },
        "No tenés permiso para armar la venta",
        "Pedile a quien pueda que la arme.",
      ],
      [
        { kind: "restoration_in_progress" },
        "La caja se está restaurando",
        "Esperá a que termine para armar la venta.",
      ],
      [
        { kind: "battery_critical" },
        "No se puede abrir la venta",
        "El motivo y qué hacer se muestran arriba de la pantalla.",
      ],
      [{ kind: "unavailable" }, "No se pudo armar la venta", "Probá de nuevo."],
    ] as const)(
      "shows why the sale was not rebuilt on %j and stays on the screen",
      async (outcome, title, description) => {
        const { screen, onGoToSale } = await renderScreen({
          loadStartupPending: async () => BLOCKED_BY_QR,
          rebuildSaleAgainstPaidOrder: async () => outcome,
        });

        await press(screen, "a", "Cobro con QR pagado sin venta");

        await expect.element(screen.getByText(title)).toBeVisible();
        await expect.element(screen.getByText(description)).toBeVisible();
        expect(onGoToSale).not.toHaveBeenCalled();
      },
    );

    it("drops the refusal once that paid order is passed to refund", async () => {
      const load = vi
        .fn<() => Promise<StartupPending>>()
        .mockResolvedValueOnce({ ...BLOCKED_BY_QR, sales_to_print: [NEVER_PRINTED] })
        .mockResolvedValue({ ...NOTHING, sales_to_print: [NEVER_PRINTED] });
      const { screen } = await renderScreen({
        loadStartupPending: load,
        rebuildSaleAgainstPaidOrder: async () => ({ kind: "card_type_unknown" }),
      });
      await press(screen, "a", "Cobro con QR pagado sin venta");
      await expect
        .element(screen.getByText("Todavía falta el tipo de tarjeta de este cobro"))
        .toBeVisible();

      await userEvent.keyboard("r");
      await userEvent.keyboard("{Enter}");

      await expect.element(screen.getByText("El cobro quedó como reembolso")).toBeVisible();
      await expect
        .element(screen.getByText("Todavía falta el tipo de tarjeta de este cobro"))
        .not.toBeInTheDocument();
    });

    it("closes the refusal from its Cerrar", async () => {
      const { screen } = await renderScreen({
        loadStartupPending: async () => BLOCKED_BY_QR,
        rebuildSaleAgainstPaidOrder: async () => ({ kind: "card_type_unknown" }),
      });
      await press(screen, "a", "Cobro con QR pagado sin venta");

      await userEvent.click(screen.getByRole("button", { name: "Cerrar", exact: true }));

      await expect
        .element(screen.getByText("Todavía falta el tipo de tarjeta de este cobro"))
        .not.toBeInTheDocument();
    });

    it("says the sale could not be rebuilt when the request itself fails", async () => {
      const { screen } = await renderScreen({
        loadStartupPending: async () => BLOCKED_BY_QR,
        rebuildSaleAgainstPaidOrder: async () => {
          throw new Error("core down");
        },
      });

      await press(screen, "a", "Cobro con QR pagado sin venta");

      await expect.element(screen.getByText("No se pudo armar la venta")).toBeVisible();
    });

    it.each(["not_found", "already_resolved"] as const)(
      "reads the items again on %s",
      async (kind) => {
        const load = vi
          .fn<() => Promise<StartupPending>>()
          .mockResolvedValueOnce(BLOCKED_BY_QR)
          .mockResolvedValue(NOTHING);
        const { screen, onGoToSale } = await renderScreen({
          loadStartupPending: load,
          rebuildSaleAgainstPaidOrder: async () => ({ kind }),
        });

        await press(screen, "a", "Cobro con QR pagado sin venta");

        await expect.element(screen.getByText("No queda nada pendiente")).toBeVisible();
        expect(onGoToSale).not.toHaveBeenCalled();
      },
    );

    it.each(["not_signed_in", "no_open_session"] as const)(
      "tells the route the session is no longer valid on %s",
      async (kind) => {
        const { screen, onSessionInvalid } = await renderScreen({
          loadStartupPending: async () => BLOCKED_BY_QR,
          rebuildSaleAgainstPaidOrder: async () => ({ kind }),
        });

        await press(screen, "a", "Cobro con QR pagado sin venta");

        await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
      },
    );

    it("offers to go back to the sale instead once the order has its sale being rebuilt", async () => {
      const { screen, rebuildSaleAgainstPaidOrder, onGoToSale } = await renderScreen({
        loadStartupPending: async () => REBUILT_QR,
      });

      await expect.element(screen.getByText("Armando la venta")).toBeVisible();
      await expect
        .poll(legendOf)
        .toEqual(["↑↓Pendientes", "AVolver a la venta armada", "RPasar a reembolso"]);
      await press(screen, "a", "Armando la venta");

      expect(onGoToSale).toHaveBeenCalledOnce();
      expect(rebuildSaleAgainstPaidOrder).not.toHaveBeenCalled();
    });

    it("leaves to the order's status that its sale is being rebuilt, its detail telling only what was paid", async () => {
      const { screen } = await renderScreen({ loadStartupPending: async () => REBUILT_QR });

      await expect.element(screen.getByText("Armando la venta")).toBeVisible();
      await expect
        .element(screen.getByText("$ 800,00 cobrados a las 15:30.", { exact: true }))
        .toBeVisible();
    });

    it("has no accessibility violations", async () => {
      const { screen } = await renderScreen({ loadStartupPending: async () => REBUILT_QR });
      await expect.element(screen.getByText("Armando la venta")).toBeVisible();

      await expectNoAccessibilityViolations(screen.container);
    });
  });

  describe("choosing a row and acting on it by key", () => {
    const rowsOf = rowsOfTable;
    const mixedPending = async () => MIXED_PENDING;

    it("has no actions column and no button on a row", async () => {
      const { screen } = await renderScreen({ loadStartupPending: mixedPending });
      await expect.element(screen.getByText("Venta sin ticket")).toBeVisible();

      await expect
        .element(screen.getByRole("columnheader", { name: "Acción" }))
        .not.toBeInTheDocument();
      await expect.element(rowsOf(screen).nth(1).getByRole("button")).not.toBeInTheDocument();
      await expect.element(screen.getByRole("columnheader", { name: "Pendiente" })).toBeVisible();
      await expect.element(screen.getByRole("columnheader", { name: "Estado" })).toBeVisible();
    });

    it("selects the first row and moves the selection with the arrows, never past either end", async () => {
      const { screen } = await renderScreen({ loadStartupPending: mixedPending });
      await expect.element(rowsOf(screen).nth(1)).toHaveAttribute("aria-current", "true");

      await userEvent.keyboard("{ArrowUp}");
      await expect.element(rowsOf(screen).nth(1)).toHaveAttribute("aria-current", "true");
      await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");

      await expect.element(rowsOf(screen).nth(3)).toHaveAttribute("aria-current", "true");
      await expect.element(rowsOf(screen).nth(1)).not.toHaveAttribute("aria-current");
    });

    it("selects a row when it is clicked", async () => {
      const { screen } = await renderScreen({ loadStartupPending: mixedPending });
      await expect.element(screen.getByText("Venta sin ticket")).toBeVisible();

      await userEvent.click(screen.getByText("Factura de las 12:05"));

      await expect.element(rowsOf(screen).nth(3)).toHaveAttribute("aria-current", "true");
    });

    it("shows the keys of the selected row: a paid order, a sale to print, then an invoice being consulted", async () => {
      const { screen } = await renderScreen({ loadStartupPending: mixedPending });

      await expect
        .poll(legendOf)
        .toEqual(["↑↓Pendientes", "AArmar la venta", "RPasar a reembolso"]);
      await userEvent.keyboard("{ArrowDown}");
      await expect.poll(legendOf).toEqual(["↑↓Pendientes", "PImprimir"]);
      await userEvent.keyboard("{ArrowDown}");
      await expect.poll(legendOf).toEqual(["↑↓Pendientes"]);
      await expect.element(screen.getByText("Consultando")).toBeVisible();
    });

    it("acts on the selected row only: the sale below a selected paid order is not printed", async () => {
      const { screen, printOriginalReceipt, rebuildSaleAgainstPaidOrder } = await renderScreen({
        loadStartupPending: mixedPending,
      });
      await expect.element(screen.getByText("Venta sin ticket")).toBeVisible();

      await userEvent.keyboard("p");
      expect(printOriginalReceipt).not.toHaveBeenCalled();
      await userEvent.keyboard("a");

      expect(rebuildSaleAgainstPaidOrder).toHaveBeenCalledExactlyOnceWith("tx-1");
    });
  });

  describe("after the refund of a paid order", () => {
    it("leaves a sale to print selected, with the keys to move and print", async () => {
      const load = vi
        .fn<() => Promise<StartupPending>>()
        .mockResolvedValueOnce({
          ...BLOCKED_BY_QR,
          sales_to_print: [NEVER_PRINTED],
        })
        .mockResolvedValue({ ...NOTHING, sales_to_print: [NEVER_PRINTED] });
      const { screen } = await renderScreen({ loadStartupPending: load });

      await press(screen, "r", "Cobro con QR pagado sin venta");
      await userEvent.keyboard("{Enter}");

      await expect
        .element(screen.getByText("Cobro con QR pagado sin venta"))
        .not.toBeInTheDocument();
      await expect.element(screen.getByText("Venta sin ticket")).toBeVisible();
      await expect.poll(legendOf).toEqual(["↑↓Pendientes", "PImprimir"]);
    });
  });

  describe("when the items cannot be read", () => {
    it("replaces the table with its failure, offers R Reintentar and still lets the person go selling", async () => {
      const load = vi
        .fn<() => Promise<StartupPending>>()
        .mockRejectedValueOnce(new Error("core down"))
        .mockResolvedValue({ ...NOTHING, sales_to_print: [NEVER_PRINTED] });
      const { screen, onGoSelling } = await renderScreen({ loadStartupPending: load });

      await expect
        .element(screen.getByText("No se pudo leer lo que quedó pendiente"))
        .toBeVisible();
      await expect.element(screen.getByText("Podés ir a vender igual.")).toBeVisible();
      await expect.poll(legendOf).toEqual(["RReintentar"]);
      expect(screen.getByRole("main").getByRole("button").elements()).toEqual([]);
      await expectGoSellingOpen(screen);
      await userEvent.keyboard("{Enter}");
      expect(onGoSelling).toHaveBeenCalledOnce();

      await userEvent.keyboard("r");

      await expect.element(screen.getByText("Venta sin ticket")).toBeVisible();
      expect(load).toHaveBeenCalledTimes(2);
    });
  });

  describe("keys while something is open over the list", () => {
    it("ignores the keys of the screen while the refund confirmation is open", async () => {
      const { screen, onGoSelling, rebuildSaleAgainstPaidOrder, printOriginalReceipt } =
        await renderScreen({
          loadStartupPending: async () => ({
            ...BLOCKED_BY_QR,
            sales_to_print: [NEVER_PRINTED],
          }),
        });
      await press(screen, "r", "Cobro con QR pagado sin venta");
      const panel = screen.getByRole("complementary", { name: "¿Pasar el cobro a reembolso?" });
      await expect.element(panel).toBeVisible();

      await userEvent.keyboard("a");
      await userEvent.keyboard("r");
      await userEvent.keyboard("p");
      await userEvent.keyboard("{ArrowDown}");
      await userEvent.keyboard("{ArrowUp}");

      expect(rebuildSaleAgainstPaidOrder).not.toHaveBeenCalled();
      expect(printOriginalReceipt).not.toHaveBeenCalled();
      expect(onGoSelling).not.toHaveBeenCalled();
      await expect.element(panel).toBeVisible();
      await expect.element(rowsOfTable(screen).nth(1)).toHaveAttribute("aria-current", "true");
    });

    it("keeps the key legend of the table shown while the refund confirmation is open", async () => {
      const { screen } = await renderScreen({ loadStartupPending: async () => BLOCKED_BY_QR });
      await press(screen, "r", "Cobro con QR pagado sin venta");
      await expect
        .element(screen.getByRole("complementary", { name: "¿Pasar el cobro a reembolso?" }))
        .toBeVisible();

      await expect
        .poll(legendOf)
        .toEqual(["↑↓Pendientes", "AArmar la venta", "RPasar a reembolso"]);
    });

    it("ignores the keys of the screen while the duplicate receipt dialog is open", async () => {
      const { screen, onGoSelling, printOriginalReceipt } = await renderScreen({
        loadStartupPending: async () => ({
          ...NOTHING,
          sales_to_print: [OUTCOME_UNKNOWN, NEVER_PRINTED],
        }),
      });
      await press(screen, "p", "Ticket sin confirmar");
      await expect.element(screen.getByRole("dialog")).toBeVisible();

      await userEvent.keyboard("p");
      await userEvent.keyboard("a");
      await userEvent.keyboard("r");
      await userEvent.keyboard("{ArrowDown}");

      expect(printOriginalReceipt).not.toHaveBeenCalled();
      expect(onGoSelling).not.toHaveBeenCalled();
      await expect.element(rowsOfTable(screen).nth(1)).toHaveAttribute("aria-current", "true");
    });

    it("ignores the keys of the screen while the sale is being rebuilt", async () => {
      const answer = deferred<RebuildSaleAgainstPaidOrderOutcome>();
      const { screen, onGoSelling, rebuildSaleAgainstPaidOrder } = await renderScreen({
        loadStartupPending: async () => BLOCKED_BY_QR,
        rebuildSaleAgainstPaidOrder: () => answer.promise,
      });
      await press(screen, "a", "Cobro con QR pagado sin venta");
      await vi.waitFor(() => expect(rebuildSaleAgainstPaidOrder).toHaveBeenCalledOnce());

      await userEvent.keyboard("r");
      await userEvent.keyboard("{Enter}");

      await expect
        .element(screen.getByRole("complementary", { name: "¿Pasar el cobro a reembolso?" }))
        .not.toBeInTheDocument();
      expect(onGoSelling).not.toHaveBeenCalled();
    });
  });

  describe("the search for paid orders without a sale", () => {
    const WARNING =
      "Puede haber un cobro pagado para esta caja sin venta. La caja lo va a consultar cuando vuelva la conexión.";
    const CONSULTING =
      "Puede haber un cobro pagado para esta caja sin venta. La caja lo está consultando.";

    it("warns, without blocking, when the search was deferred for lack of connection", async () => {
      const { screen, onGoSelling } = await renderScreen({
        loadStartupPending: async () => ({ ...NOTHING, paid_order_discovery: "deferred" }),
      });

      await expect.element(screen.getByText(WARNING)).toBeVisible();
      await expect.element(screen.getByText("Sin consultar")).toBeVisible();
      await expectGoSellingOpen(screen);
      await userEvent.click(goSelling(screen));
      expect(onGoSelling).toHaveBeenCalledOnce();
    });

    it("keeps the warning while the check runs, then tells the route nothing is left once it found nothing", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const load = vi
        .fn<() => Promise<StartupPending>>()
        .mockResolvedValueOnce({ ...NOTHING, paid_order_discovery: "pending" })
        .mockResolvedValue(NOTHING);
      const { screen, onNothingLeft } = await renderScreen({ loadStartupPending: load });
      await expect.element(screen.getByText(CONSULTING)).toBeVisible();
      await expect.element(screen.getByText("Consultando")).toBeVisible();
      expect(onNothingLeft).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(3000);

      await vi.waitFor(() => expect(onNothingLeft).toHaveBeenCalledOnce());
    });

    it("shows the search being done beside the other items, locking Ir a vender while the core keeps the cashier from selling until it ends", async () => {
      const { screen, onGoSelling } = await renderScreen({
        loadStartupPending: async () => ({
          ...NOTHING,
          sales_to_print: [NEVER_PRINTED],
          paid_order_discovery: "pending",
          may_go_selling: false,
        }),
      });
      const rows = screen.getByRole("table", { name: "Pendientes" }).getByRole("row");

      await expect.element(rows.nth(2).getByText("Cobros pagados sin consultar")).toBeVisible();
      await expect.element(rows.nth(2).getByText(CONSULTING)).toBeVisible();
      await expect.element(rows.nth(2).getByText("Consultando")).toBeVisible();
      await expect.element(screen.getByText(WARNING)).not.toBeInTheDocument();
      await expectGoSellingLocked(screen);
      await expect.element(screen.getByText(CHECKING_REASON)).not.toBeInTheDocument();
      await hoverGoSelling(screen);
      await expect.element(screen.getByRole("tooltip")).toHaveTextContent(CHECKING_REASON);
      goSelling(screen)
        .element()
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(onGoSelling).not.toHaveBeenCalled();
    });

    it("enables Ir a vender once the core lets the cashier sell after the search was deferred", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const load = vi
        .fn<() => Promise<StartupPending>>()
        .mockResolvedValueOnce({
          ...NOTHING,
          paid_order_discovery: "pending",
          may_go_selling: false,
        })
        .mockResolvedValue({ ...NOTHING, paid_order_discovery: "deferred" });
      const { screen } = await renderScreen({ loadStartupPending: load });
      await expectGoSellingLocked(screen);

      await vi.advanceTimersByTimeAsync(3000);

      await expect.element(screen.getByText(WARNING)).toBeVisible();
      await expectGoSellingOpen(screen);
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
        may_go_selling: true,
      }),
    });
    await expect.element(screen.getByText("Venta sin ticket")).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });
});
