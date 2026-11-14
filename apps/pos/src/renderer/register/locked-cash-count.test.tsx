import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render as renderBare } from "vitest-browser-react";
import type { RegisterStatusData } from "../shell/register-status-context";
import { RegisterStatusProvider } from "../shell/register-status-context";
import type { RefusedClose } from "./close-cash-session-panel";
import { LockedCashCount } from "./locked-cash-count";
import type { Close } from "./test-support/locked-cash-count";
import {
  BALANCE,
  CANCELLABLE_SALE,
  closeWith,
  GRACE,
  OPENING,
  renderStep,
} from "./test-support/locked-cash-count";

const STATUS: RegisterStatusData = {
  person: undefined,
  registerName: "Caja 1",
  cashSession: {
    status: "open",
    id: "s1",
    openedAt: "2026-09-30T09:02:00.000-03:00",
    openedBy: GRACE,
    locked: true,
  },
  status: { status: "loading" },
  backupTickets: { status: "loading" },
  onDiscardBackupTickets: () => {},
};

describe("LockedCashCount", () => {
  it("heads the register's header with who closes and whose session it is, with no rail", async () => {
    const screen = await renderBare(
      <RegisterStatusProvider value={STATUS}>
        <LockedCashCount
          sessionId="s1"
          opener={GRACE}
          closerName="Sofía"
          loadCashBalance={async () => BALANCE}
          loadCashCountPreview={async () => null}
          loadOpenSale={async () => null}
          loadCashMovements={async () => [OPENING]}
          close={async () => ({ kind: "unavailable" })}
          cancelSale={async () => ({ kind: "unavailable" })}
          onRefused={() => {}}
        />
      </RegisterStatusProvider>,
    );

    await expect
      .element(screen.getByRole("region", { name: "Estado de la caja" }))
      .toMatchTextContent(/^CAJA 1•Cierra Sofía · sesión de Grace/);
    await expect.element(screen.getByRole("navigation")).not.toBeInTheDocument();
  });

  it("lists the session's movements, with the expected cash and the close panel beside them", async () => {
    const { screen } = await renderStep();

    const table = screen.getByRole("table", { name: "Movimientos de la sesión" });
    await expect.element(table.getByText("Apertura", { exact: true })).toBeVisible();
    await expect.element(table.getByText("Grace", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("EFECTIVO ESPERADO", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("complementary", { name: "Cerrar caja" })).toBeVisible();
    await expect.element(screen.getByRole("navigation")).not.toBeInTheDocument();
    await expect.element(screen.getByLabelText("PIN")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("textbox", { name: "Contado" })).toHaveFocus();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("goes back to the locked register with Esc, without closing", async () => {
    const { screen, close } = await renderStep();

    await userEvent.keyboard("{Escape}");

    await vi.waitFor(() => expect(screen.router.state.location.pathname).toBe("/locked"));
    expect(close).not.toHaveBeenCalled();
  });

  it("closes the session with the counted cash in cents, with the button and with Enter", async () => {
    const close = vi.fn<Close>(async () => ({ kind: "unavailable" }));
    const { screen } = await renderStep({ close });

    await closeWith(screen, "45800,00");
    await userEvent.keyboard("{Enter}");

    await expect.poll(() => close.mock.calls).toEqual([[4_580_000], [4_580_000]]);
  });

  it("asks for the counted cash when none was typed, without closing", async () => {
    const { screen, close } = await renderStep();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

    await expect.element(screen.getByText("Ingresá el efectivo contado.")).toBeVisible();
    expect(close).not.toHaveBeenCalled();
  });

  it("asks for a valid amount when the core refuses the counted cash", async () => {
    const { screen } = await renderStep({ close: async () => ({ kind: "invalid_counted_cash" }) });

    await closeWith(screen, "45800,00");

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 31.500,00."))
      .toBeVisible();
  });

  it.each<[string, Close]>([
    ["the core is unavailable", async () => ({ kind: "unavailable" })],
    ["the request fails", () => Promise.reject(new Error("the core connection was replaced"))],
  ])("says the session could not be closed when %s", async (_case, close) => {
    const { screen } = await renderStep({ close });

    await closeWith(screen, "45800,00");

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo cerrar la caja. Probá de nuevo.");
  });

  it.each<RefusedClose>([
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 4 },
    { kind: "rate_limited", retry_after_seconds: 5, attempts_left: 4 },
    { kind: "locked", consecutive_failures: 8 },
    { kind: "lacks_permission" },
    { kind: "not_locked" },
  ])("hands a refused closer back when the core answers $kind", async (refusal) => {
    const { screen, refused } = await renderStep({ close: async () => refusal });

    await closeWith(screen, "45800,00");

    await expect.poll(() => refused).toEqual([refusal]);
  });

  it("disables Cerrar caja while the open sale is read and while one is open", async () => {
    const { screen } = await renderStep({ loadOpenSale: async () => CANCELLABLE_SALE });

    await expect.element(screen.getByText("Hay una venta abierta", { exact: false })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeDisabled();
  });

  it("shows the open sale the close finds when one was opened after the count was asked for", async () => {
    const { screen } = await renderStep({
      close: async () => ({ kind: "open_sale", total: 2_519_250 }),
      loadOpenSale: vi
        .fn<() => Promise<typeof CANCELLABLE_SALE | null>>()
        .mockResolvedValueOnce(null)
        .mockResolvedValue(CANCELLABLE_SALE),
    });

    await closeWith(screen, "45800,00");

    await expect.element(screen.getByText("Hay una venta abierta de $ 25.192,50")).toBeVisible();
  });

  it("says the open sale could not be read, and reads it again on Reintentar", async () => {
    const loadOpenSale = vi
      .fn<() => Promise<typeof CANCELLABLE_SALE | null | "unavailable">>()
      .mockResolvedValueOnce("unavailable")
      .mockResolvedValue(CANCELLABLE_SALE);
    const { screen } = await renderStep({ loadOpenSale });
    await expect.element(screen.getByText("No se pudo leer la venta abierta")).toBeVisible();

    await screen.getByRole("button", { name: "Reintentar" }).click();

    await expect.element(screen.getByText("Hay una venta abierta de $ 25.192,50")).toBeVisible();
  });
});
