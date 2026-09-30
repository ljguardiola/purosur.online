import type { CashBalance } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { CashScreen } from "./cash-screen";

const PERSON = { user_id: "u1", first_name: "Ada", permission_keys: ["sell_and_charge"] };
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

async function renderScreen(
  props: {
    registerName?: string | null;
    loadCashBalance?: () => Promise<CashBalance | null | "unavailable">;
  } = {},
) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  return render(
    <CashScreen
      person={PERSON}
      registerName={props.registerName === undefined ? "Caja 1" : props.registerName}
      openedAt={OPENED_AT}
      lock={() => {}}
      loadCashBalance={props.loadCashBalance ?? (async () => BALANCE)}
    />,
  );
}

describe("CashScreen", () => {
  it("is headed Caja and names the register and when the session opened in the eyebrow", async () => {
    const screen = await renderScreen();

    await expect.element(screen.getByRole("heading", { name: "Caja" })).toBeVisible();
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
});
