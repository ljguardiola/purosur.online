import type {
  CancelLockedSaleOutcome,
  CashBalance,
  CashCountPreview,
  CloseLockedCashSessionOutcome,
  SessionOpenSale,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SignedInPerson } from "../shell/signed-in-person";
import { render } from "../shell/test-support/render-with-router";
import type { RefusedClose } from "./locked-cash-count";
import { LockedCashCount } from "./locked-cash-count";

const GRACE: SignedInPerson = {
  user_id: "u2",
  first_name: "Grace",
  abilities: ["open_cash_session"],
};
const OPENED_AT = "2026-09-30T09:02:00.000-03:00";
const BALANCE: CashBalance = {
  opening_float: { amount: 2_000_000, direction: "in" },
  cash_sales: { amount: 3_500_000, direction: "in" },
  change_given: { amount: 930_000, direction: "out" },
  refunds: { amount: 0, direction: "out" },
  cash_in: { amount: 100_000, direction: "in" },
  expenses: { amount: 50_000, direction: "out" },
  withdrawals: { amount: 0, direction: "out" },
  expected: 4_620_000,
};
const CLOSED: CloseLockedCashSessionOutcome = {
  kind: "closed",
  session: { id: "s1", expected_cash: 4_620_000, counted_cash: 4_580_000, difference: -40_000 },
};
const SHORT_NOTICE =
  "Faltan $ 400,00. La diferencia se registra con la sesión y no impide cerrarla.";
const REQUIRED_MESSAGE = "Ingresá el efectivo contado.";
const INVALID_MESSAGE = "Ingresá un importe válido, por ejemplo 31.500,00.";
const FAILED_NOTICE = "No se pudo cerrar la caja. Probá de nuevo.";

type Close = (countedCash: number) => Promise<CloseLockedCashSessionOutcome>;
type CancelSale = (saleId: string) => Promise<CancelLockedSaleOutcome>;
type LoadOpenSale = () => Promise<SessionOpenSale | null | "unavailable">;

const PREVIEW_DIFFERENCES = new Map([
  [4_580_000, -40_000],
  [4_620_000, 0],
  [4_660_000, 40_000],
  [3_000_000_000, 2_953_800_000],
]);

type LoadCashCountPreview = (
  countedCash: number,
) => Promise<CashCountPreview | null | "unavailable">;

const answerPreview: LoadCashCountPreview = async (countedCash) => {
  const difference = PREVIEW_DIFFERENCES.get(countedCash);
  return difference === undefined ? null : { difference };
};

const CANCELLABLE_SALE: SessionOpenSale = {
  id: "sale-1",
  total: 3_434_000,
  paid: 0,
  cancellable: true,
  refunds_on_cancel: [],
};
const PART_PAID_SALE: SessionOpenSale = {
  id: "sale-2",
  total: 3_434_000,
  paid: 1_000_000,
  cancellable: false,
  refunds_on_cancel: [{ payment_id: "p1", method: "CASH", amount: 1_000_000, state: "APPROVED" }],
};
const OPEN_SALE_NOTICE = "Hay una venta abierta de $ 34.340,00";
const CANCEL_FAILED_NOTICE = "No se pudo cancelar la venta. Probá de nuevo.";

async function renderStep(
  options: {
    close?: Close;
    cancelSale?: CancelSale;
    loadOpenSale?: LoadOpenSale;
    loadCashCountPreview?: LoadCashCountPreview;
  } = {},
) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  const closing = options.close ?? vi.fn<Close>(async () => CLOSED);
  const cancelling =
    options.cancelSale ?? vi.fn<CancelSale>(async () => ({ kind: "cancelled", refunds: [] }));
  const loadOpenSale = options.loadOpenSale ?? vi.fn<LoadOpenSale>(async () => null);
  const refused: RefusedClose[] = [];
  const screen = await render(
    <LockedCashCount
      sessionId="s1"
      opener={GRACE}
      closerName="Sofía"
      registerName="Caja 1"
      openedAt={OPENED_AT}
      loadCashBalance={async () => BALANCE}
      loadCashCountPreview={options.loadCashCountPreview ?? answerPreview}
      loadOpenSale={loadOpenSale}
      close={closing}
      cancelSale={cancelling}
      onRefused={(refusal) => refused.push(refusal)}
    />,
  );
  await expect
    .element(screen.getByRole("complementary").getByText("$ 46.200,00", { exact: true }))
    .toBeVisible();
  return { screen, close: closing, cancelSale: cancelling, loadOpenSale, refused };
}

function withOpenSale(options: { close?: Close; cancelSale?: CancelSale } = {}) {
  return renderStep({ ...options, loadOpenSale: async () => CANCELLABLE_SALE });
}

type Screen = Awaited<ReturnType<typeof renderStep>>["screen"];

async function closeWith(screen: Screen, typed: string) {
  await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), typed);
  await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("LockedCashCount", () => {
  it("asks for the counted cash, saying who closes and whose session it is", async () => {
    const { screen } = await renderStep();

    await expect.element(screen.getByRole("heading", { name: "Cerrar caja" })).toBeVisible();
    await expect.element(screen.getByText("Caja 1 · Sesión abierta 09:02")).toBeVisible();
    await expect.element(screen.getByText("Cierra Sofía. La sesión es de Grace.")).toBeVisible();
    await expect
      .element(screen.getByText("Contá el efectivo que hay en la caja y cargá el total."))
      .toBeVisible();
    await expect.element(screen.getByText("EFECTIVO ESPERADO", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("navigation")).not.toBeInTheDocument();
    await expect.element(screen.getByLabelText("PIN")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("warns when cash is missing", async () => {
    const { screen } = await renderStep();

    await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), "45.800,00");

    await expect.element(screen.getByText(SHORT_NOTICE).first()).toBeVisible();
  });

  it("shows the difference and the warning the core answers for the counted cash", async () => {
    const loadCashCountPreview = vi.fn<LoadCashCountPreview>(async () => ({ difference: 70_000 }));
    const { screen } = await renderStep({ loadCashCountPreview });

    await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), "45.800,00");

    await expect.poll(() => loadCashCountPreview.mock.calls).toEqual([[4_580_000]]);
    await expect
      .element(
        screen
          .getByText(
            "Sobran $ 700,00. La diferencia se registra con la sesión y no impide cerrarla.",
          )
          .first(),
      )
      .toBeVisible();
  });

  it("keeps the previous difference until the core answers the next count", async () => {
    const next = deferred<CashCountPreview | null>();
    const { screen } = await renderStep({
      loadCashCountPreview: (countedCash) =>
        countedCash === 4_580_000 ? answerPreview(countedCash) : next.promise,
    });
    const field = screen.getByRole("textbox", { name: "Efectivo contado" });
    await userEvent.fill(field, "45.800,00");
    await expect.element(screen.getByText(SHORT_NOTICE).first()).toBeVisible();

    await userEvent.fill(field, "46.600,00");

    await expect.element(screen.getByText("$ 46.600,00")).toBeVisible();
    await expect.element(screen.getByText(SHORT_NOTICE).first()).toBeVisible();
    next.resolve({ difference: 40_000 });
    await expect.element(screen.getByText("Sobran", { exact: false }).first()).toBeVisible();
  });

  it("compares any amount it can read as a count, however large", async () => {
    const { screen } = await renderStep();

    await userEvent.fill(
      screen.getByRole("textbox", { name: "Efectivo contado" }),
      "30.000.000,00",
    );

    await expect.element(screen.getByText("$ 30.000.000,00")).toBeVisible();
    await expect.element(screen.getByText("Sobran", { exact: false }).first()).toBeVisible();
  });

  it("leaves a count of any amount it can read for the core to judge, showing its refusal", async () => {
    const close = vi.fn<Close>(async () => ({ kind: "invalid_counted_cash" }));
    const { screen } = await renderStep({ close });

    await closeWith(screen, "30.000.000,00");

    await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();
    expect(close).toHaveBeenCalledWith(3_000_000_000);
  });

  it("closes the session with the counted cash in cents", async () => {
    const close = vi.fn<Close>(async () => CLOSED);
    const { screen } = await renderStep({ close });

    await closeWith(screen, "45.800,00");

    await expect.poll(() => close.mock.calls).toEqual([[4_580_000]]);
  });

  it("asks for the counted cash when none was typed, without closing", async () => {
    const { screen, close } = await renderStep();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

    await expect.element(screen.getByText(REQUIRED_MESSAGE)).toBeVisible();
    expect(close).not.toHaveBeenCalled();
  });

  it("keeps the message while the edited count is still invalid and clears it once it is valid", async () => {
    const { screen } = await renderStep();
    await closeWith(screen, "abc");
    await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();

    await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), "abd");
    await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();

    await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), "45.800,00");
    await expect.element(screen.getByText(INVALID_MESSAGE)).not.toBeInTheDocument();
  });

  it("asks for a valid amount when the core refuses the counted cash", async () => {
    const { screen } = await renderStep({ close: async () => ({ kind: "invalid_counted_cash" }) });

    await closeWith(screen, "45.800,00");

    await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();
  });

  it("offers to cancel a part-paid sale too, asking first what would be refunded", async () => {
    const { screen, cancelSale } = await renderStep({ loadOpenSale: async () => PART_PAID_SALE });

    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    await expect.element(screen.getByText("Cancelala para cerrar la caja.")).toBeVisible();
    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    const dialog = screen.getByRole("dialog", { name: "¿Cancelar la venta?" });
    await expect.element(dialog.getByText("Venta en curso · Con pagos")).toBeVisible();
    await expect.element(dialog.getByText("Devolver $ 10.000,00 en efectivo")).toBeVisible();
    expect(cancelSale).not.toHaveBeenCalled();
  });

  it("clears the notice and shows the refunds to give back once a part-paid sale is cancelled", async () => {
    const cancelSale = vi.fn<CancelSale>(async () => ({
      kind: "cancelled",
      refunds: PART_PAID_SALE.refunds_on_cancel,
    }));
    const { screen, close } = await renderStep({
      cancelSale,
      loadOpenSale: async () => PART_PAID_SALE,
    });
    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    await screen.getByRole("dialog").getByRole("button", { name: "Cancelar la venta" }).click();

    const cancelled = screen.getByRole("dialog", { name: "Venta cancelada" });
    await expect.element(cancelled.getByText("Devolver $ 10.000,00 en efectivo")).toBeVisible();
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).not.toBeInTheDocument();
    await cancelled.getByRole("button", { name: "Listo" }).click();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await closeWith(screen, "45.800,00");
    await expect.poll(() => close).toHaveBeenCalledWith(4_580_000);
  });

  it("keeps the part-paid sale and says so when the closer may not cancel it", async () => {
    const { screen } = await renderStep({
      cancelSale: async () => ({ kind: "not_permitted" }),
      loadOpenSale: async () => PART_PAID_SALE,
    });
    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    await screen.getByRole("dialog").getByRole("button", { name: "Cancelar la venta" }).click();

    await expect
      .element(screen.getByText("No tenés el permiso de anular ventas con pagos."))
      .toBeVisible();
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
  });

  it("clears the notice when the core finds no part-paid sale left to cancel", async () => {
    const { screen } = await renderStep({
      cancelSale: async () => ({ kind: "no_open_sale" }),
      loadOpenSale: async () => PART_PAID_SALE,
    });
    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    await screen.getByRole("dialog").getByRole("button", { name: "Cancelar la venta" }).click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).not.toBeInTheDocument();
  });

  it("sends the closer back to identification when the core refuses their authorization", async () => {
    const refusal: CancelLockedSaleOutcome = { kind: "not_locked" };
    const { screen, refused } = await renderStep({
      cancelSale: async () => refusal,
      loadOpenSale: async () => PART_PAID_SALE,
    });
    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    await screen.getByRole("dialog").getByRole("button", { name: "Cancelar la venta" }).click();

    await expect.poll(() => refused).toEqual([refusal]);
  });

  it("offers to cancel an open sale that can be cancelled as soon as the count is asked for", async () => {
    const { screen, close } = await withOpenSale();

    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    await expect.element(screen.getByText("Cancelala para cerrar la caja.")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cancelar la venta" })).toBeVisible();
    await expect
      .element(screen.getByText("Grace tiene que retomar la caja para terminarla o cancelarla."))
      .not.toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("keeps the cancel button inside the open sale's notice, below its title", async () => {
    const { screen } = await withOpenSale();

    const title = screen.getByText(OPEN_SALE_NOTICE).element();
    let notice = title.parentElement;
    while (notice !== null && getComputedStyle(notice).backgroundColor === "rgba(0, 0, 0, 0)") {
      notice = notice.parentElement;
    }
    const button = screen.getByRole("button", { name: "Cancelar la venta" }).element();

    const noticeBox = (notice as HTMLElement).getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    expect(buttonBox.top).toBeGreaterThanOrEqual(title.getBoundingClientRect().bottom);
    expect(buttonBox.top).toBeGreaterThanOrEqual(noticeBox.top);
    expect(buttonBox.bottom).toBeLessThanOrEqual(noticeBox.bottom);
    expect(buttonBox.left).toBeGreaterThanOrEqual(noticeBox.left);
    expect(buttonBox.right).toBeLessThanOrEqual(noticeBox.right);
  });

  it("keeps the open sale while the count is typed", async () => {
    const { screen } = await withOpenSale();
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();

    await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), "45.800,00");

    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cancelar la venta" })).toBeVisible();
  });

  it("shows the open sale the close finds when one was opened after the count was asked for", async () => {
    const { screen } = await renderStep({
      close: async () => ({ kind: "open_sale", total: 3_434_000, cancellable: true }),
      loadOpenSale: vi
        .fn<LoadOpenSale>()
        .mockResolvedValueOnce(null)
        .mockResolvedValue(CANCELLABLE_SALE),
    });

    await closeWith(screen, "45.800,00");

    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cancelar la venta" })).toBeVisible();
  });

  it("shows a placeholder in the count while the open sale is read", async () => {
    const { screen } = await renderStep({ loadOpenSale: () => new Promise(() => {}) });

    await expect.element(screen.getByRole("main").getByText("Cargando…")).toBeInTheDocument();
  });

  it("says the open sale could not be read and reads it again on Reintentar, starting from its placeholder", async () => {
    const reread = deferred<SessionOpenSale | null | "unavailable">();
    const loadOpenSale = vi
      .fn<LoadOpenSale>()
      .mockResolvedValueOnce("unavailable")
      .mockReturnValueOnce(reread.promise);
    const { screen } = await renderStep({ loadOpenSale });
    await expect.element(screen.getByText("No se pudo leer la venta abierta")).toBeVisible();

    await screen.getByRole("button", { name: "Reintentar" }).click();

    await expect.element(screen.getByRole("main").getByText("Cargando…")).toBeInTheDocument();
    reread.resolve(CANCELLABLE_SALE);
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    await expect.element(screen.getByRole("main").getByText("Cargando…")).not.toBeInTheDocument();
  });

  it("asks for confirmation before cancelling the open sale", async () => {
    const { screen, cancelSale } = await withOpenSale();

    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    const dialog = screen.getByRole("dialog", { name: "¿Cancelar la venta?" });
    await expect.element(dialog).toBeVisible();
    await expect.element(dialog.getByText("$ 34.340,00")).toBeVisible();
    expect(cancelSale).not.toHaveBeenCalled();
  });

  it("keeps the open sale when going back from the confirmation", async () => {
    const { screen, cancelSale } = await withOpenSale();
    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    await screen.getByRole("dialog").getByRole("button", { name: "Volver" }).click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    expect(cancelSale).not.toHaveBeenCalled();
  });

  it("clears the notice once the sale is cancelled and lets the closer close the register", async () => {
    const { screen, close, cancelSale } = await withOpenSale();
    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    await screen.getByRole("dialog").getByRole("button", { name: "Cancelar la venta" }).click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).not.toBeInTheDocument();
    expect(cancelSale).toHaveBeenCalledOnce();
    await closeWith(screen, "45.800,00");
    await expect.poll(() => close).toHaveBeenCalledWith(4_580_000);
  });

  it("disables the screen's buttons while the sale is being cancelled", async () => {
    const pending = deferred<CancelLockedSaleOutcome>();
    const { screen } = await withOpenSale({ cancelSale: () => pending.promise });
    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    await screen.getByRole("dialog").getByRole("button", { name: "Cancelar la venta" }).click();

    await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "Volver" }).first()).toBeDisabled();
    pending.resolve({ kind: "cancelled", refunds: [] });
    await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeEnabled();
  });

  it("clears the notice when the core finds no sale left to cancel", async () => {
    const { screen } = await withOpenSale({ cancelSale: async () => ({ kind: "no_open_sale" }) });
    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    await screen.getByRole("dialog").getByRole("button", { name: "Cancelar la venta" }).click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).not.toBeInTheDocument();
  });

  it.each<[string, CancelSale]>([
    ["the core is unavailable", async () => ({ kind: "unavailable" })],
    ["the request fails", () => Promise.reject(new Error("the core connection was replaced"))],
  ])(
    "says the sale could not be cancelled when %s, keeping the open sale",
    async (_case, cancel) => {
      const { screen } = await withOpenSale({ cancelSale: cancel });
      await screen.getByRole("button", { name: "Cancelar la venta" }).click();

      await screen.getByRole("dialog").getByRole("button", { name: "Cancelar la venta" }).click();

      await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
      await expect.element(screen.getByText(CANCEL_FAILED_NOTICE).first()).toBeVisible();
      await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    },
  );

  it.each<CancelLockedSaleOutcome>([{ kind: "cancelled", refunds: [] }, { kind: "not_permitted" }])(
    "drops the earlier cancellation failure once a new attempt answers $kind",
    async (outcome) => {
      const cancelSale = vi
        .fn<CancelSale>()
        .mockResolvedValueOnce({ kind: "unavailable" })
        .mockResolvedValueOnce(outcome);
      const { screen } = await withOpenSale({ cancelSale });
      await screen.getByRole("button", { name: "Cancelar la venta" }).click();
      await screen.getByRole("dialog").getByRole("button", { name: "Cancelar la venta" }).click();
      await expect.element(screen.getByText(CANCEL_FAILED_NOTICE).first()).toBeVisible();

      await screen.getByRole("button", { name: "Cancelar la venta" }).click();
      await screen.getByRole("dialog").getByRole("button", { name: "Cancelar la venta" }).click();

      await expect.poll(() => cancelSale.mock.calls.length).toBe(2);
      await expect.element(screen.getByText(CANCEL_FAILED_NOTICE)).not.toBeInTheDocument();
    },
  );

  it.each<RefusedClose>([
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 4 },
    { kind: "rate_limited", retry_after_seconds: 5, attempts_left: 4 },
    { kind: "locked", consecutive_failures: 8 },
    { kind: "lacks_permission" },
    { kind: "not_locked" },
  ])(
    "hands a refused closer back when the core answers $kind to the cancellation",
    async (refusal) => {
      const { screen, refused } = await withOpenSale({ cancelSale: async () => refusal });
      await screen.getByRole("button", { name: "Cancelar la venta" }).click();

      await screen.getByRole("dialog").getByRole("button", { name: "Cancelar la venta" }).click();

      await expect.poll(() => refused).toEqual([refusal]);
    },
  );

  it.each<[string, Close]>([
    ["the core is unavailable", async () => ({ kind: "unavailable" })],
    ["the request fails", () => Promise.reject(new Error("the core connection was replaced"))],
  ])("says the session could not be closed when %s", async (_case, close) => {
    const { screen } = await renderStep({ close });

    await closeWith(screen, "45.800,00");

    await expect.element(screen.getByText(FAILED_NOTICE).first()).toBeVisible();
  });

  it.each<RefusedClose>([
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 4 },
    { kind: "rate_limited", retry_after_seconds: 5, attempts_left: 4 },
    { kind: "locked", consecutive_failures: 8 },
    { kind: "lacks_permission" },
    { kind: "not_locked" },
  ])("hands a refused closer back when the core answers $kind", async (refusal) => {
    const { screen, refused } = await renderStep({ close: async () => refusal });

    await closeWith(screen, "45.800,00");

    await expect.poll(() => refused).toEqual([refusal]);
  });

  it("goes back to the locked register when Volver is pressed", async () => {
    const { screen, close } = await renderStep();

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(screen.router.state.location.pathname).toBe("/locked");
    expect(close).not.toHaveBeenCalled();
  });
});
