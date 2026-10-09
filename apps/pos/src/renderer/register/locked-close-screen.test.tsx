import type {
  Authorization,
  CancelLockedSaleOutcome,
  CashBalance,
  CloseLockedCashSessionOutcome,
  IdentifyLockedCloserOutcome,
  SessionOpenSale,
} from "@purosur/contracts";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SignedInPerson } from "../shell/signed-in-person";
import { render } from "../shell/test-support/render-with-router";
import { LockedCloseScreen } from "./locked-close-screen";

const GRACE: SignedInPerson = {
  user_id: "u2",
  first_name: "Grace",
  abilities: ["open_cash_session"],
};
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
const IDENTIFIED: IdentifyLockedCloserOutcome = {
  kind: "identified",
  person: { user_id: "u3", first_name: "Sofía" },
};

type Close = (countedCash: number, closer: Authorization) => Promise<CloseLockedCashSessionOutcome>;
type CancelSale = (saleId: string, closer: Authorization) => Promise<CancelLockedSaleOutcome>;

async function renderScreen(
  options: {
    identify?: () => Promise<IdentifyLockedCloserOutcome>;
    close?: Close;
    cancelSale?: CancelSale;
    loadOpenSale?: () => Promise<SessionOpenSale | null | "unavailable">;
  } = {},
) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  const loadCashBalance = vi.fn(async () => BALANCE);
  const loadCashCountPreview = vi.fn(async (_countedCash: number) => ({ difference: -40_000 }));
  const close = options.close ?? vi.fn<Close>(async () => ({ kind: "unavailable" }));
  const screen = await render(
    <LockedCloseScreen
      sessionId="s1"
      opener={GRACE}
      registerName="Caja 1"
      loadCashBalance={loadCashBalance}
      loadCashCountPreview={loadCashCountPreview}
      loadOpenSale={options.loadOpenSale ?? (async () => null)}
      loadClosers={async () => [{ id: "u3", first_name: "Sofía" }]}
      identifyLockedCloser={options.identify ?? (async () => IDENTIFIED)}
      closeLockedCashSession={close}
      cancelLockedSale={options.cancelSale ?? (async () => ({ kind: "cancelled", refunds: [] }))}
    />,
  );
  return { screen, loadCashBalance, loadCashCountPreview, close };
}

type Screen = Awaited<ReturnType<typeof renderScreen>>["screen"];

async function identifySofia(screen: Screen) {
  await userEvent.click(screen.getByText("Sofía", { exact: true }));
  await userEvent.type(screen.getByLabelText("PIN"), "1234");
  await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

async function closeWith(screen: Screen, typed: string) {
  await expect
    .element(screen.getByRole("complementary").getByText("$ 46.200,00", { exact: true }))
    .toBeVisible();
  await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), typed);
  await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));
}

describe("LockedCloseScreen", () => {
  it("reads the people who can close once, however many times the screen renders", async () => {
    const loadClosers = vi.fn(async () => [{ id: "u3", first_name: "Sofía" }]);
    const element = () => (
      <LockedCloseScreen
        sessionId="s1"
        opener={GRACE}
        registerName="Caja 1"
        loadCashBalance={async () => BALANCE}
        loadCashCountPreview={async () => null}
        loadOpenSale={async () => null}
        loadClosers={loadClosers}
        identifyLockedCloser={async () => IDENTIFIED}
        closeLockedCashSession={async () => ({ kind: "unavailable" })}
        cancelLockedSale={async () => ({ kind: "unavailable" })}
      />
    );
    const screen = await render(element());
    await expect.element(screen.getByText("Sofía", { exact: true })).toBeVisible();

    await screen.rerender(element());

    await expect.element(screen.getByText("Sofía", { exact: true })).toBeVisible();
    expect(loadClosers).toHaveBeenCalledOnce();
  });

  it("reads no cash figure until the person who closes is identified", async () => {
    const { screen, loadCashBalance } = await renderScreen();

    await expect
      .element(screen.getByRole("heading", { name: "¿Quién cierra la caja?" }))
      .toBeVisible();
    expect(loadCashBalance).not.toHaveBeenCalled();
    expect(screen.container.textContent).not.toContain("$");
  });

  it("stays on who closes the register while the PIN is refused", async () => {
    const { screen, loadCashBalance } = await renderScreen({
      identify: async () => ({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 4 }),
    });

    await identifySofia(screen);

    await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
    expect(loadCashBalance).not.toHaveBeenCalled();
  });

  it("previews the typed count with the core once the person is identified", async () => {
    const { screen, loadCashCountPreview } = await renderScreen();
    await identifySofia(screen);
    await expect
      .element(screen.getByRole("complementary").getByText("$ 46.200,00", { exact: true }))
      .toBeVisible();

    await userEvent.fill(screen.getByRole("textbox", { name: "Efectivo contado" }), "45.800,00");

    await expect.poll(() => loadCashCountPreview.mock.calls).toEqual([[4_580_000]]);
  });

  it("counts the cash once the person is identified, and closes with their PIN", async () => {
    const close = vi.fn<Close>(async () => ({ kind: "unavailable" }));
    const { screen } = await renderScreen({ close });

    await identifySofia(screen);
    await expect.element(screen.getByText("Cierra Sofía. La sesión es de Grace.")).toBeVisible();
    await closeWith(screen, "45.800,00");

    await expect
      .poll(() => close.mock.calls)
      .toEqual([[4_580_000, { user_id: "u3", pin: "1234" }]]);
  });

  it("goes back to who closes the register, saying why, when the close refuses the closer", async () => {
    const { screen } = await renderScreen({ close: async () => ({ kind: "lacks_permission" }) });

    await identifySofia(screen);
    await closeWith(screen, "45.800,00");

    await expect
      .element(screen.getByRole("heading", { name: "¿Quién cierra la caja?" }))
      .toBeVisible();
    await expect.element(screen.getByText("Sofía no puede cerrar la caja")).toBeVisible();
    await expect.element(screen.getByText("$ 46.200,00", { exact: true })).not.toBeInTheDocument();
  });

  it("shows the open sale once the person who closes is identified and cancels it with their PIN", async () => {
    const cancelSale = vi.fn<CancelSale>(async () => ({ kind: "cancelled", refunds: [] }));
    const { screen } = await renderScreen({
      loadOpenSale: async () => ({
        id: "sale-1",
        total: 3_434_000,
        paid: 0,
        cancellable: true,
        refunds_on_cancel: [],
      }),
      cancelSale,
    });
    await identifySofia(screen);
    await expect.element(screen.getByText("Hay una venta abierta de $ 34.340,00")).toBeVisible();
    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    await screen.getByRole("dialog").getByRole("button", { name: "Cancelar la venta" }).click();

    await expect
      .poll(() => cancelSale.mock.calls)
      .toEqual([["sale-1", { user_id: "u3", pin: "1234" }]]);
  });
});
