import type { CashBalance, CloseLockedCashSessionOutcome } from "@purosur/contracts";
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

async function renderStep(close?: Close) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  const closing = close ?? vi.fn<Close>(async () => CLOSED);
  const refused: RefusedClose[] = [];
  const screen = await render(
    <LockedCashCount
      sessionId="s1"
      opener={GRACE}
      closerName="Sofía"
      registerName="Caja 1"
      openedAt={OPENED_AT}
      loadCashBalance={async () => BALANCE}
      close={closing}
      onRefused={(refusal) => refused.push(refusal)}
    />,
  );
  await expect
    .element(screen.getByRole("complementary").getByText("$ 46.200,00", { exact: true }))
    .toBeVisible();
  return { screen, close: closing, refused };
}

type Screen = Awaited<ReturnType<typeof renderStep>>["screen"];

async function closeWith(screen: Screen, typed: string) {
  await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), typed);
  await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
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
    const { screen } = await renderStep(close);

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
    const { screen } = await renderStep(async () => ({ kind: "invalid_counted_cash" }));

    await closeWith(screen, "45.800,00");

    await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();
  });

  it("says a sale is still open and that its opener has to resume the register to finish it", async () => {
    const { screen } = await renderStep(async () => ({ kind: "open_sale", total: 3_434_000 }));

    await closeWith(screen, "45.800,00");

    await expect.element(screen.getByText("Hay una venta abierta de $ 34.340,00")).toBeVisible();
    await expect
      .element(screen.getByText("Grace tiene que retomar la caja para terminarla o cancelarla."))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Ir a la venta" }))
      .not.toBeInTheDocument();
  });

  it.each<[string, Close]>([
    ["the core is unavailable", async () => ({ kind: "unavailable" })],
    ["the request fails", () => Promise.reject(new Error("the core connection was replaced"))],
  ])("says the session could not be closed when %s", async (_case, close) => {
    const { screen } = await renderStep(close);

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
    const { screen, refused } = await renderStep(async () => refusal);

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
