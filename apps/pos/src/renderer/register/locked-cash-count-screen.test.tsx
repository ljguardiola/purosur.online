import type {
  Authorization,
  CashBalance,
  CloseLockedCashSessionOutcome,
  SignInUser,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SignedInPerson } from "../access/signed-in-person";
import { render } from "../shell/test-support/render-with-router";
import { LockedCashCountScreen } from "./locked-cash-count-screen";

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
const CLOSERS: SignInUser[] = [{ id: "u3", first_name: "Sofía" }];
const SHORT_NOTICE =
  "Faltan $ 400,00. La diferencia se registra con la sesión y no impide cerrarla.";
const REQUIRED_MESSAGE = "Ingresá el efectivo contado.";
const INVALID_MESSAGE = "Ingresá un importe válido, por ejemplo 31.500,00.";
const FAILED_NOTICE = "No se pudo cerrar la caja. Probá de nuevo.";

type CloseLockedCashSession = (
  countedCash: number,
  closer: Authorization,
) => Promise<CloseLockedCashSessionOutcome>;

async function renderScreen(closeLockedCashSession?: CloseLockedCashSession) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  const close = closeLockedCashSession ?? vi.fn<CloseLockedCashSession>(async () => CLOSED);
  const screen = await render(
    <LockedCashCountScreen
      opener={GRACE}
      registerName="Caja 1"
      openedAt={OPENED_AT}
      loadCashBalance={async () => BALANCE}
      loadAuthorizers={async () => CLOSERS}
      closeLockedCashSession={close}
    />,
  );
  await expect
    .element(screen.getByRole("complementary").getByText("$ 46.200,00", { exact: true }))
    .toBeVisible();
  return { screen, close };
}

type Screen = Awaited<ReturnType<typeof renderScreen>>["screen"];

async function count(screen: Screen, typed: string) {
  await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), typed);
}

async function pickCloser(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: /Persona que cierra/ }));
  await userEvent.click(screen.getByRole("option", { name: "Sofía" }));
  await userEvent.type(screen.getByLabelText("PIN"), "1234");
}

async function closeWith(screen: Screen, typed: string) {
  await count(screen, typed);
  await pickCloser(screen);
  await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
}

describe("LockedCashCountScreen", () => {
  it("asks for the counted cash and for someone with permission to close, saying whose session it is", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("heading", { name: "Cerrar caja" })).toBeVisible();
    await expect.element(screen.getByText("Caja 1 · Sesión abierta 09:02")).toBeVisible();
    await expect
      .element(screen.getByText("Contá el efectivo que hay en la caja y cargá el total."))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "La sesión es de Grace: la cierra alguien con permiso para cerrar la sesión de otra persona.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByText("CIERRA ALGUIEN CON PERMISO")).toBeVisible();
    await expect.element(screen.getByRole("navigation")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("warns when cash is missing", async () => {
    const { screen } = await renderScreen();

    await count(screen, "45.800,00");

    await expect.element(screen.getByText(SHORT_NOTICE).first()).toBeVisible();
  });

  it("keeps Cerrar caja disabled until someone is chosen and types a PIN", async () => {
    const { screen } = await renderScreen();
    await count(screen, "45.800,00");

    await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeDisabled();

    await pickCloser(screen);

    await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeEnabled();
  });

  it("closes the session with the counted cash in cents and the person who closes it", async () => {
    const close = vi.fn<CloseLockedCashSession>(async () => CLOSED);
    const { screen } = await renderScreen(close);

    await closeWith(screen, "45.800,00");

    await expect
      .poll(() => close.mock.calls)
      .toEqual([[4_580_000, { user_id: "u3", pin: "1234" }]]);
  });

  it("asks for the counted cash when none was typed, without closing", async () => {
    const { screen, close } = await renderScreen();

    await pickCloser(screen);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

    await expect.element(screen.getByText(REQUIRED_MESSAGE)).toBeVisible();
    expect(close).not.toHaveBeenCalled();
  });

  it("asks for a valid amount when the core refuses the counted cash", async () => {
    const { screen } = await renderScreen(async () => ({ kind: "invalid_counted_cash" }));

    await closeWith(screen, "45.800,00");

    await expect.element(screen.getByText(INVALID_MESSAGE)).toBeVisible();
  });

  it("says a sale is still open and that its opener has to resume the register to finish it", async () => {
    const { screen } = await renderScreen(async () => ({ kind: "open_sale", total: 3_434_000 }));

    await closeWith(screen, "45.800,00");

    await expect.element(screen.getByText("Hay una venta abierta de $ 34.340,00")).toBeVisible();
    await expect
      .element(screen.getByText("Grace tiene que retomar la caja para terminarla o cancelarla."))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Ir a la venta" }))
      .not.toBeInTheDocument();
  });

  it("shows a refused PIN in the section of the person who closes", async () => {
    const { screen } = await renderScreen(async () => ({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 4,
    }));

    await closeWith(screen, "45.800,00");

    await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
  });

  it("says the chosen person cannot close the register when they lack the permission", async () => {
    const { screen } = await renderScreen(async () => ({ kind: "lacks_permission" }));

    await closeWith(screen, "45.800,00");

    await expect.element(screen.getByText("Sofía no puede cerrar la caja")).toBeVisible();
  });

  it.each<[string, CloseLockedCashSession]>([
    ["the core is unavailable", async () => ({ kind: "unavailable" })],
    ["the request fails", () => Promise.reject(new Error("the core connection was replaced"))],
    ["someone is signed in at the core", async () => ({ kind: "not_locked" })],
  ])("says the session could not be closed when %s", async (_case, closeLockedCashSession) => {
    const { screen } = await renderScreen(closeLockedCashSession);

    await closeWith(screen, "45.800,00");

    await expect.element(screen.getByText(FAILED_NOTICE).first()).toBeVisible();
  });

  it("goes back to the locked register when Volver is pressed", async () => {
    const { screen, close } = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(screen.router.state.location.pathname).toBe("/locked");
    expect(close).not.toHaveBeenCalled();
  });
});
