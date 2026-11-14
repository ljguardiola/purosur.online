import type { CashBalance, ListedCashMovement } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  STORE_NOTEBOOK_WINDOW,
  scrollTheAreaHoldingItToItsEnd,
  showInStoreNotebookWindow,
  windowOverflow,
} from "../shell/test-support/register-window";
import { BALANCE, FLETE, OPENING, PERSON, renderScreen } from "./test-support/cash-screen";

describe("CashScreen", () => {
  it("scrolls a page of movements longer than the window inside the list's own area, with the clock guard, the menu and the expected cash in place", async () => {
    const movements = Array.from({ length: 25 }, (_, index) => ({
      ...FLETE,
      id: `m${index + 2}`,
    }));
    const screen = await renderScreen({
      loadCashMovements: async () => [OPENING, ...movements],
      clockGuard: <p>Aviso del reloj</p>,
    });
    await showInStoreNotebookWindow();
    const table = screen.getByRole("table", { name: "Movimientos de la sesión" });
    const lastMovement = table.getByText("Flete").last();
    await expect.element(lastMovement).toBeInTheDocument();

    scrollTheAreaHoldingItToItsEnd(lastMovement.element());

    await expect.element(lastMovement).toBeInViewport();
    await expect.element(screen.getByText("Aviso del reloj")).toBeInViewport();
    expect(windowOverflow()).toEqual({ vertical: 0, horizontal: 0 });
    const menu = screen.getByRole("navigation", { name: "Menú de la caja" }).element();
    expect(menu.getBoundingClientRect().height).toBe(STORE_NOTEBOOK_WINDOW.height);
    const panel = screen.getByRole("complementary").element();
    expect(panel.getBoundingClientRect().height).toBe(STORE_NOTEBOOK_WINDOW.height);
  });

  it("is headed Movimientos de efectivo for screen readers only, leaving the register's name to the frame's header", async () => {
    const screen = await renderScreen();

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Movimientos de efectivo" }))
      .toBeInTheDocument();
    await expect.element(screen.getByText(/Caja 1/)).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows what it is given for the clock guard together with the movements", async () => {
    const screen = await renderScreen({ clockGuard: <p>Aviso del reloj</p> });

    await expect.element(screen.getByText("Aviso del reloj")).toBeVisible();
    await expect
      .element(screen.getByRole("table", { name: "Movimientos de la sesión" }))
      .toBeVisible();
  });

  it("marks Caja as the current item of the rail, next to Venta", async () => {
    const screen = await renderScreen();

    await expect
      .element(screen.getByRole("link", { name: "Caja" }))
      .toHaveAttribute("aria-current", "page");
    await expect.element(screen.getByRole("link", { name: "Venta" })).toBeVisible();
  });

  it("offers the sales history, in the rail, to a person who may view it", async () => {
    const screen = await renderScreen({
      person: { ...PERSON, abilities: ["open_cash_session", "view_sales_history"] },
    });

    await expect.element(screen.getByRole("link", { name: "Historial" })).toBeVisible();
  });

  it("offers no sales history, in the rail, to a person who may not view it", async () => {
    const screen = await renderScreen();

    await expect.element(screen.getByRole("link", { name: "Caja" })).toBeVisible();
    await expect.element(screen.getByRole("link", { name: "Historial" })).not.toBeInTheDocument();
  });

  it("shows the cash the register expects now, broken down", async () => {
    const screen = await renderScreen();

    await expect.element(screen.getByText("EFECTIVO ESPERADO", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 46.200,00", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Ventas en efectivo")).toBeVisible();
    await expect.element(screen.getByText("$ 35.000,00", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("\u2013 $ 9.300,00", { exact: true })).toBeVisible();
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
    await expect.element(table.getByText("Apertura", { exact: true })).toBeVisible();
    await expect.element(table.getByText("Flete", { exact: true })).toBeVisible();
  });

  it("shows no movement while they load", async () => {
    const screen = await renderScreen({ loadCashMovements: () => new Promise(() => {}) });

    const table = screen.getByRole("table", { name: "Movimientos de la sesión" });
    await expect.element(table).toHaveAttribute("aria-busy", "true");
    await expect.element(table.getByText("Apertura")).not.toBeInTheDocument();
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
          .getByText("Apertura", { exact: true }),
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

  it("offers Cerrar caja with F12 and the three movements with their keys, in every state", async () => {
    const screen = await renderScreen({
      loadCashBalance: async () => "unavailable",
      loadCashMovements: async () => "unavailable",
    });

    const buttons = Array.from(screen.container.querySelectorAll("aside button")).map(
      (button) => button.textContent,
    );
    expect(buttons.filter((text) => text !== "Reintentar")).toEqual([
      "Cerrar cajaF12",
      "1Ingreso",
      "2Gasto",
      "3Retiro",
    ]);
    await expect.element(screen.getByRole("button", { name: "Ingreso" })).toBeEnabled();
  });

  it("shows the keys of the table's footer: 1 Ingreso, 2 Gasto, 3 Retiro and F12 Cerrar caja", async () => {
    const screen = await renderScreen();

    const legend = Array.from(screen.container.querySelectorAll("main ul li")).map(
      (item) => item.textContent,
    );
    expect(legend).toEqual(["1Ingreso", "2Gasto", "3Retiro", "F12Cerrar caja"]);
  });

  it("offers the movement count with no filter by type, and no Registrar movimiento button", async () => {
    const screen = await renderScreen();

    await expect.element(screen.getByText("2 movimientos")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /Tipo/ })).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Registrar movimiento" }))
      .not.toBeInTheDocument();
  });
});
