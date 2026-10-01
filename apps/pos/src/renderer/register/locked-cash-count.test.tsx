import type {
  CancelLockedSaleOutcome,
  CashBalance,
  CloseLockedCashSessionOutcome,
  SessionOpenSale,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SignedInPerson } from "../access/signed-in-person";
import { render } from "../shell/test-support/render-with-router";
import type { RefusedClose } from "./locked-cash-count";
import { LockedCashCount } from "./locked-cash-count";

const GRACE: SignedInPerson = {
  user_id: "u2",
  first_name: "Grace",
  permission_keys: ["sell_and_charge"],
};
const OPENED_AT = "2026-09-30T12:02:00.000Z";
const BALANCE: CashBalance = {
  opening_float: 2_000_000,
  cash_sales: 3_500_000,
  change_given: 930_000,
  refunds: 0,
  cash_in: 100_000,
  expenses: 50_000,
  withdrawals: 0,
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
type CancelSale = () => Promise<CancelLockedSaleOutcome>;
type LoadOpenSale = () => Promise<SessionOpenSale | null | "unavailable">;

const CANCELLABLE_SALE: SessionOpenSale = { total: 3_434_000, cancellable: true };
const OPEN_SALE_NOTICE = "Hay una venta abierta de $ 34.340,00";
const CANCEL_FAILED_NOTICE = "No se pudo cancelar la venta. Probá de nuevo.";

async function renderStep(
  options: { close?: Close; cancelSale?: CancelSale; loadOpenSale?: LoadOpenSale } = {},
) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  const closing = options.close ?? vi.fn<Close>(async () => CLOSED);
  const cancelling = options.cancelSale ?? vi.fn<CancelSale>(async () => ({ kind: "cancelled" }));
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

  it("asks for a valid amount when the core refuses the counted cash", async () => {
    const { screen } = await renderStep({ close: async () => ({ kind: "invalid_counted_cash" }) });

    await closeWith(screen, "45.800,00");

    await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();
  });

  it("says a sale is still open and that its opener has to resume the register to finish it when it cannot be cancelled", async () => {
    const { screen } = await renderStep({
      loadOpenSale: async () => ({ total: 3_434_000, cancellable: false }),
    });

    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    await expect
      .element(screen.getByText("Grace tiene que retomar la caja para terminarla o cancelarla."))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Cancelar la venta" }))
      .not.toBeInTheDocument();
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

  it("keeps the open sale while the count is typed", async () => {
    const { screen } = await withOpenSale();
    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();

    await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), "45.800,00");

    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cancelar la venta" })).toBeVisible();
  });

  it("shows the open sale the close finds when one was opened after the count was asked for", async () => {
    const { screen } = await renderStep({
      close: async () => ({ kind: "open_sale", ...CANCELLABLE_SALE }),
    });

    await closeWith(screen, "45.800,00");

    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cancelar la venta" })).toBeVisible();
  });

  it("says the open sale could not be read and reads it again on Reintentar", async () => {
    const loadOpenSale = vi
      .fn<LoadOpenSale>()
      .mockResolvedValueOnce("unavailable")
      .mockResolvedValueOnce(CANCELLABLE_SALE);
    const { screen } = await renderStep({ loadOpenSale });
    await expect.element(screen.getByText("No se pudo leer la venta abierta")).toBeVisible();

    await screen.getByRole("button", { name: "Reintentar" }).click();

    await expect.element(screen.getByText(OPEN_SALE_NOTICE)).toBeVisible();
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
    pending.resolve({ kind: "cancelled" });
    await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeEnabled();
  });

  it("says the open sale cannot be cancelled once the core finds an approved payment on it", async () => {
    const { screen } = await withOpenSale({
      cancelSale: async () => ({ kind: "has_approved_payment" }),
    });
    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    await screen.getByRole("dialog").getByRole("button", { name: "Cancelar la venta" }).click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect
      .element(screen.getByText("Grace tiene que retomar la caja para terminarla o cancelarla."))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Cancelar la venta" }))
      .not.toBeInTheDocument();
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

  it.each<CancelLockedSaleOutcome>([{ kind: "cancelled" }, { kind: "has_approved_payment" }])(
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
