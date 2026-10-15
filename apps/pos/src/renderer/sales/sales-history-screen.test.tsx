import type { SalesHistoryOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  chooseSale,
  DEFERRED_ROW,
  FISCAL_ROW,
  pageOf,
  renderScreen,
  table,
} from "./test-support/sales-history-screen";

describe("SalesHistoryScreen", () => {
  it("lists the sales with their time, comprobante, operation, methods, total and state", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("heading", { name: "Historial de ventas" }))
      .toBeVisible();
    await expect.element(screen.getByText("Caja 1 · Sesión abierta")).toBeVisible();
    const sales = table(screen);
    await expect.element(sales.getByText("11:42")).toBeVisible();
    await expect.element(sales.getByText("Factura C", { exact: true })).toBeVisible();
    await expect.element(sales.getByText("PV 00003 · Nº 00001248")).toBeVisible();
    await expect.element(sales.getByText("Operación 000482")).toBeVisible();
    await expect.element(sales.getByText("Efectivo", { exact: true })).toBeVisible();
    await expect.element(sales.getByText("$ 50.700,00")).toBeVisible();
    await expect.element(sales.getByText("Completada")).toBeVisible();
    await expect.element(sales.getByText("Documento no fiscal")).toBeVisible();
    await expect.element(sales.getByText("Venta diferida · falta facturar")).toBeVisible();
    await expect.element(sales.getByText("Transferencia + Efectivo")).toBeVisible();
    await expect.element(sales.getByText("Diferida")).toBeVisible();
    await expect.element(sales.getByText("En trámite")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows only the operation number of a sale with no comprobante", async () => {
    const { screen } = await renderScreen();

    await expect.element(table(screen).getByText("Operación 000480")).toBeVisible();
  });

  it("reads the first page of the open session's sales, of every state, when a session is open", async () => {
    const { screen, salesHistory } = await renderScreen();

    await expect.element(table(screen).getByText("11:42")).toBeVisible();
    expect(salesHistory).toHaveBeenCalledExactlyOnceWith({
      session: "open",
      state: "all",
      page: 1,
    });
    await expect.element(screen.getByRole("button", { name: "Sesión: La abierta" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Estado: Todos" })).toBeVisible();
  });

  it("reads the register's sales of every session, and says there is no session open, when none is open", async () => {
    const { screen, salesHistory } = await renderScreen({ sessionOpen: false });

    await expect.element(screen.getByText("Caja 1 · Sin sesión abierta")).toBeVisible();
    await expect.element(table(screen).getByText("11:42")).toBeVisible();
    expect(salesHistory).toHaveBeenCalledExactlyOnceWith({ session: "all", state: "all", page: 1 });
  });

  it("offers the states a sale can be in, without a cancelled one", async () => {
    const { screen } = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Estado: Todos" }));

    const options = Array.from(document.querySelectorAll("[role=option]")).map(
      (option) => option.textContent,
    );
    expect(options).toEqual(["Todos", "Completada", "Anulada", "En trámite", "Diferida"]);
  });

  it("asks the core again for the state chosen, from the first page", async () => {
    const { screen, salesHistory } = await renderScreen();
    await expect.element(table(screen).getByText("11:42")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Estado: Todos" }));
    await userEvent.click(screen.getByRole("option", { name: "Diferida" }));

    await expect
      .poll(() => salesHistory.mock.calls.at(-1)?.[0])
      .toEqual({ session: "open", state: "deferred", page: 1 });
  });

  it("asks the core again for every session when Todas is chosen", async () => {
    const { screen, salesHistory } = await renderScreen();
    await expect.element(table(screen).getByText("11:42")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Sesión: La abierta" }));
    await userEvent.click(screen.getByRole("option", { name: "Todas" }));

    await expect
      .poll(() => salesHistory.mock.calls.at(-1)?.[0])
      .toEqual({ session: "all", state: "all", page: 1 });
  });

  it("shows which sales of how many are on the page and pages through them, 50 at a time", async () => {
    const { screen, salesHistory } = await renderScreen({
      salesHistory: async () => pageOf([FISCAL_ROW], 128),
    });

    await expect.element(screen.getByText("1 a 50 de 128 ventas")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Página 2" }));

    await expect
      .poll(() => salesHistory.mock.calls.at(-1)?.[0])
      .toEqual({ session: "open", state: "all", page: 2 });
  });

  it("counts the last page up to the total", async () => {
    const { screen } = await renderScreen({
      salesHistory: async ({ page: requested }) =>
        requested === 1 ? pageOf([FISCAL_ROW], 128) : pageOf([DEFERRED_ROW], 128),
    });

    await userEvent.click(screen.getByRole("button", { name: "Página 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Página 3" }));

    await expect.element(screen.getByText("101 a 128 de 128 ventas")).toBeVisible();
  });

  it("says in the singular that there is one sale", async () => {
    const { screen } = await renderScreen({ salesHistory: async () => pageOf([FISCAL_ROW]) });

    await expect.element(screen.getByText("1 venta", { exact: true })).toBeVisible();
  });

  it("shows no sale while they load", async () => {
    const { screen } = await renderScreen({ salesHistory: () => new Promise(() => {}) });

    await expect.element(table(screen)).toHaveAttribute("aria-busy", "true");
    await expect.element(screen.getByText("11:42")).not.toBeInTheDocument();
  });

  it("says the sales could not be read and reads them again on retry", async () => {
    const answers: SalesHistoryOutcome[] = [{ kind: "unavailable" }, pageOf([FISCAL_ROW])];
    const { screen, salesHistory } = await renderScreen({
      salesHistory: async () => answers.shift() ?? { kind: "unavailable" },
    });

    await expect.element(screen.getByText("No se pudieron leer las ventas")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(table(screen).getByText("11:42")).toBeVisible();
    expect(salesHistory).toHaveBeenCalledTimes(2);
  });

  it("says there are no sales yet when none was made", async () => {
    const { screen } = await renderScreen({
      sessionOpen: false,
      salesHistory: async () => pageOf([]),
    });

    await expect.element(screen.getByText("Todavía no hay ventas")).toBeVisible();
  });

  it("says no sale is in the state chosen when the filter hides them all", async () => {
    const { screen } = await renderScreen({
      salesHistory: async ({ state }) => (state === "all" ? pageOf([FISCAL_ROW]) : pageOf([])),
    });
    await expect.element(table(screen).getByText("11:42")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Estado: Todos" }));
    await userEvent.click(screen.getByRole("option", { name: "Diferida" }));

    await expect.element(screen.getByText("No hay ventas en ese estado")).toBeVisible();
  });

  it("says the person may not see the sales history", async () => {
    const { screen } = await renderScreen({
      salesHistory: async () => ({ kind: "lacks_permission" }),
    });

    await expect
      .element(screen.getByText("No tenés permiso para ver el historial de ventas"))
      .toBeVisible();
  });

  it("says the session is over when the core says nobody is signed in", async () => {
    const { screen } = await renderScreen({
      salesHistory: async () => ({ kind: "not_signed_in" }),
    });

    await expect
      .element(screen.getByText("La sesión terminó. Volvé a ingresar para ver las ventas"))
      .toBeVisible();
  });

  it("asks to choose a sale until one is chosen", async () => {
    const { screen, saleHistoryDetail } = await renderScreen();

    await expect.element(screen.getByText("Elegí una venta para ver su detalle")).toBeVisible();
    expect(saleHistoryDetail).not.toHaveBeenCalled();
  });

  it("shows the detail of the sale chosen, read from the core", async () => {
    const { screen, saleHistoryDetail } = await renderScreen();

    await chooseSale(screen, "11:42");

    await expect.element(screen.getByText("VENTA DE LAS 11:42")).toBeVisible();
    await expect.element(screen.getByText("8 líneas")).toBeVisible();
    expect(saleHistoryDetail).toHaveBeenCalledWith("sale-1");
  });

  it("opens the reprint of the sale chosen from its print button", async () => {
    const { screen } = await renderScreen();
    await chooseSale(screen, "11:42");

    await userEvent.click(screen.getByRole("button", { name: "Reimprimir duplicado" }));

    await expect.element(screen.getByText("REIMPRIMIR VENTA DE LAS 11:42")).toBeVisible();
  });

  it("closes the reprint from Cancelar without asking the core", async () => {
    const { screen, reprintSaleReceipt } = await renderScreen();
    await chooseSale(screen, "11:42");
    await userEvent.click(screen.getByRole("button", { name: "Reimprimir duplicado" }));

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await expect.element(screen.getByText("REIMPRIMIR VENTA DE LAS 11:42")).not.toBeInTheDocument();
    expect(reprintSaleReceipt).not.toHaveBeenCalled();
  });

  it("closes the reprint, says it prints as soon as the printer is ready and reads the sale again once it started", async () => {
    const { screen, reprintSaleReceipt, saleHistoryDetail, salesHistory } = await renderScreen();
    await chooseSale(screen, "11:42");
    await userEvent.click(screen.getByRole("button", { name: "Reimprimir duplicado" }));
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Motivo de la reimpresión" }),
      "El cliente pidió otra copia",
    );

    await userEvent.click(
      screen.getByRole("dialog").getByRole("button", { name: "Reimprimir duplicado" }),
    );

    expect(reprintSaleReceipt).toHaveBeenCalledExactlyOnceWith(
      "sale-1",
      "El cliente pidió otra copia",
      undefined,
    );
    await expect
      .element(screen.getByText("La reimpresión sale en cuanto la impresora esté lista"))
      .toBeVisible();
    await expect.element(screen.getByText("Sale como duplicado.")).toBeVisible();
    await expect.element(screen.getByText("REIMPRIMIR VENTA DE LAS 11:42")).not.toBeInTheDocument();
    await expect.poll(() => saleHistoryDetail.mock.calls.length).toBe(2);
    await expect.poll(() => salesHistory.mock.calls.length).toBe(2);
  });

  it("keeps the sales shown, marked as updating, while they are read again after a reprint", async () => {
    let answer: (outcome: SalesHistoryOutcome) => void = () => {};
    let reads = 0;
    const { screen } = await renderScreen({
      salesHistory: () => {
        reads += 1;
        return reads === 1
          ? Promise.resolve(pageOf([FISCAL_ROW]))
          : new Promise((resolve) => {
              answer = resolve;
            });
      },
    });
    await chooseSale(screen, "11:42");
    await userEvent.click(screen.getByRole("button", { name: "Reimprimir duplicado" }));
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Motivo de la reimpresión" }),
      "Otra copia",
    );

    await userEvent.click(
      screen.getByRole("dialog").getByRole("button", { name: "Reimprimir duplicado" }),
    );

    await expect.element(table(screen)).toHaveAttribute("aria-busy", "true");
    await expect.element(table(screen).getByText("11:42")).toBeVisible();
    answer(pageOf([FISCAL_ROW]));
    await expect.element(table(screen)).not.toHaveAttribute("aria-busy", "true");
  });

  it("says the sale is gone and closes the reprint when the core cannot find it", async () => {
    const { screen } = await renderScreen({
      reprintSaleReceipt: async () => ({ kind: "not_found" }),
    });
    await chooseSale(screen, "11:42");
    await userEvent.click(screen.getByRole("button", { name: "Reimprimir duplicado" }));
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Motivo de la reimpresión" }),
      "Otra copia",
    );

    await userEvent.click(
      screen.getByRole("dialog").getByRole("button", { name: "Reimprimir duplicado" }),
    );

    await expect.element(screen.getByText("REIMPRIMIR VENTA DE LAS 11:42")).not.toBeInTheDocument();
  });

  it("tells the route the session is no longer valid when the reprint finds nobody signed in", async () => {
    const { screen, onSessionInvalid } = await renderScreen({
      reprintSaleReceipt: async () => ({ kind: "not_signed_in" }),
    });
    await chooseSale(screen, "11:42");
    await userEvent.click(screen.getByRole("button", { name: "Reimprimir duplicado" }));
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Motivo de la reimpresión" }),
      "Otra copia",
    );

    await userEvent.click(
      screen.getByRole("dialog").getByRole("button", { name: "Reimprimir duplicado" }),
    );

    await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
  });

  describe("menu", () => {
    it("marks Historial as the current screen of the menu and offers the sale and the cash while a session is open", async () => {
      const { screen } = await renderScreen();

      const menu = screen.getByRole("navigation", { name: "Menú de la caja" });
      await expect.element(menu.getByText("Venta")).toBeVisible();
      await expect.element(menu.getByText("Historial")).toBeVisible();
      await expect.element(menu.getByText("Caja")).toBeVisible();
    });

    it("offers going home, with no cash entries, when no session is open", async () => {
      const { screen } = await renderScreen({ sessionOpen: false });

      const menu = screen.getByRole("navigation", { name: "Menú de la caja" });
      await expect.element(menu.getByText("Inicio")).toBeVisible();
      await expect.element(menu.getByText("Historial")).toBeVisible();
      await expect.element(menu.getByText("Caja", { exact: true })).not.toBeInTheDocument();
    });

    it("asks to confirm before signing out when no session is open", async () => {
      const { screen, lock } = await renderScreen({ sessionOpen: false });

      await userEvent.click(screen.getByRole("navigation").getByRole("button", { name: "Salir" }));
      await userEvent.click(
        screen
          .getByRole("dialog", { name: "¿Salir de la caja?" })
          .getByRole("button", { name: "Salir" }),
      );

      expect(lock).toHaveBeenCalledOnce();
    });
  });
});
