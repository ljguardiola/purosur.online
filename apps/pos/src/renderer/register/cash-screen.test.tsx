import type {
  CashBalance,
  ListedCashMovement,
  RecordCashMovementOutcome,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { CashScreen } from "./cash-screen";

const PERSON = {
  user_id: "u1",
  first_name: "Ada",
  permission_keys: ["sell_and_charge", "record_cash_in"],
};
// 12:02 UTC is 09:02 in Argentina.
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

const OPENING: ListedCashMovement = {
  id: "m1",
  type: "OPENING",
  amount: 2_000_000,
  reason: null,
  occurred_at: OPENED_AT,
  actor: { user_id: "u1", first_name: "Ada" },
  authorized_by: null,
};
const FLETE: ListedCashMovement = {
  id: "m2",
  type: "CASH_OUT",
  amount: 50_000,
  reason: "Flete",
  occurred_at: "2026-09-30T13:30:00.000Z",
  actor: { user_id: "u1", first_name: "Ada" },
  authorized_by: null,
};

async function renderScreen(
  props: {
    registerName?: string | null;
    loadCashBalance?: () => Promise<CashBalance | null | "unavailable">;
    loadCashMovements?: () => Promise<ListedCashMovement[] | null | "unavailable">;
    recordCashMovement?: () => Promise<RecordCashMovementOutcome>;
  } = {},
) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  return render(
    <CashScreen
      sessionId="s1"
      person={PERSON}
      registerName={props.registerName === undefined ? "Caja 1" : props.registerName}
      openedAt={OPENED_AT}
      lock={() => {}}
      loadCashBalance={props.loadCashBalance ?? (async () => BALANCE)}
      loadCashMovements={props.loadCashMovements ?? (async () => [OPENING, FLETE])}
      loadCashMovementKinds={async () => ({
        CASH_IN: { permission: "record_cash_in", authorization_required: false },
        CASH_OUT: { permission: "record_cash_expense", authorization_required: false },
        WITHDRAWAL: { permission: "withdraw_cash", authorization_required: false },
      })}
      loadAuthorizers={async () => []}
      recordCashMovement={
        props.recordCashMovement ?? (async () => ({ kind: "recorded", authorized_by: null }))
      }
    />,
  );
}

describe("CashScreen", () => {
  it("is headed Movimientos de efectivo and names the register and when the session opened in the eyebrow", async () => {
    const screen = await renderScreen();

    await expect
      .element(screen.getByRole("heading", { name: "Movimientos de efectivo", exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText("Caja 1 · Sesión abierta 09:02")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("marks Caja as the current item of the rail, next to Venta and the first name", async () => {
    const screen = await renderScreen();

    await expect
      .element(screen.getByRole("link", { name: "Caja" }))
      .toHaveAttribute("aria-current", "page");
    await expect.element(screen.getByRole("link", { name: "Venta" })).toBeVisible();
    await expect.element(screen.getByRole("navigation").getByText("Ada")).toBeVisible();
  });

  it("shows the cash the register expects now, broken down", async () => {
    const screen = await renderScreen();

    await expect.element(screen.getByText("EFECTIVO ESPERADO AHORA")).toBeVisible();
    await expect.element(screen.getByText("$ 46.200,00", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Ventas en efectivo")).toBeVisible();
    await expect.element(screen.getByText("+ $ 35.000,00")).toBeVisible();
  });

  it("goes to the cash count when Cerrar caja is pressed", async () => {
    const screen = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

    expect(screen.router.state.location.pathname).toBe("/cash-count");
  });

  it("keeps Cerrar caja available while the balance is not known", async () => {
    const screen = await renderScreen({ loadCashBalance: async () => "unavailable" });

    await expect.element(screen.getByText("No se pudo leer el efectivo esperado")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeEnabled();
  });

  it("reads the balance again when Reintentar is pressed", async () => {
    const load = vi
      .fn<() => Promise<CashBalance | "unavailable">>()
      .mockResolvedValueOnce("unavailable")
      .mockResolvedValueOnce(BALANCE);
    const screen = await renderScreen({ loadCashBalance: load });

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(screen.getByText("$ 46.200,00", { exact: true })).toBeVisible();
  });

  it("lists the session's movements", async () => {
    const screen = await renderScreen();

    const table = screen.getByRole("table", { name: "Movimientos de la sesión" });
    await expect.element(table.getByText("Apertura de sesión", { exact: true })).toBeVisible();
    await expect.element(table.getByText("Flete", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("2 movimientos", { exact: true })).toBeVisible();
  });

  it("shows no movement while they load", async () => {
    const screen = await renderScreen({ loadCashMovements: () => new Promise(() => {}) });

    const table = screen.getByRole("table", { name: "Movimientos de la sesión" });
    await expect.element(table).toHaveAttribute("aria-busy", "true");
    await expect.element(table.getByText("Apertura de sesión")).not.toBeInTheDocument();
  });

  it("says the movements could not be read and reads them again when Reintentar is pressed", async () => {
    const load = vi
      .fn<() => Promise<ListedCashMovement[] | "unavailable">>()
      .mockResolvedValueOnce("unavailable")
      .mockResolvedValueOnce([OPENING]);
    const screen = await renderScreen({ loadCashMovements: load });
    await expect.element(screen.getByText("No se pudieron leer los movimientos")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect
      .element(
        screen
          .getByRole("table", { name: "Movimientos de la sesión" })
          .getByText("Apertura de sesión", { exact: true }),
      )
      .toBeVisible();
  });

  it("keeps the movements when the balance cannot be read, and the balance when the movements cannot", async () => {
    const balanceFails = await renderScreen({ loadCashBalance: async () => "unavailable" });
    await expect.element(balanceFails.getByText("Flete", { exact: true })).toBeVisible();
    await balanceFails.unmount();

    const movementsFail = await renderScreen({ loadCashMovements: async () => "unavailable" });
    await expect.element(movementsFail.getByText("$ 46.200,00", { exact: true })).toBeVisible();
  });

  it("offers Registrar movimiento above Cerrar caja, available in every state", async () => {
    const screen = await renderScreen({
      loadCashBalance: async () => "unavailable",
      loadCashMovements: async () => "unavailable",
    });

    const buttons = Array.from(screen.container.querySelectorAll("aside button")).map(
      (button) => button.textContent,
    );
    expect(buttons.filter((text) => text !== "Reintentar")).toEqual([
      "Registrar movimiento",
      "Cerrar caja",
    ]);
    await expect
      .element(screen.getByRole("button", { name: "Registrar movimiento", exact: true }))
      .toBeEnabled();
  });

  it("opens the movement modal when Registrar movimiento is pressed", async () => {
    const screen = await renderScreen();

    await userEvent.click(
      screen.getByRole("button", { name: "Registrar movimiento", exact: true }),
    );

    await expect
      .element(screen.getByRole("dialog", { name: "Registrar un movimiento" }))
      .toBeVisible();
  });

  it("tells the modal how much cash the balance says is in the register", async () => {
    const screen = await renderScreen();
    await expect.element(screen.getByText("$ 46.200,00", { exact: true })).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar movimiento", exact: true }),
    );

    await userEvent.click(
      screen
        .getByRole("radiogroup", { name: "Tipo de movimiento" })
        .getByText("Gasto", { exact: true }),
    );

    await expect
      .element(screen.getByText("Hay $ 46.200,00 en la caja antes de este gasto."))
      .toBeVisible();
  });
});
