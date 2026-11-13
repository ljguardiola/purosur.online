import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  chooseSale,
  DEFERRED_ROW,
  DETAIL,
  detailPanel,
  FISCAL_ROW,
  legendOf,
  pageOf,
  renderScreen,
  searchField,
  table,
} from "./test-support/sales-history-screen";

describe("SalesHistoryScreen", () => {
  it("has no screen title and lists the sales with their time, comprobante, methods, total and state", async () => {
    const { screen } = await renderScreen();

    await expect.element(table(screen).getByText("Factura C · 00003-00001248")).toBeVisible();
    await expect.element(table(screen).getByText("11:42", { exact: true })).toBeVisible();
    await expect.element(table(screen).getByText("Efectivo", { exact: true })).toBeVisible();
    await expect.element(table(screen).getByText("$ 50.700,00")).toBeVisible();
    await expect.element(table(screen).getByText("Completada")).toBeVisible();
    await expect.element(table(screen).getByText("Transferencia · Efectivo")).toBeVisible();
    await expect.element(table(screen).getByText("Diferida")).toBeVisible();
    await expect.element(table(screen).getByText("Documento no fiscal")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Historial de ventas" }))
      .not.toBeInTheDocument();
  });

  it("has no state filter, no pagination and no detail buttons", async () => {
    const { screen } = await renderScreen();

    await expect.element(table(screen)).toBeVisible();
    await expect.element(screen.getByText("Estado:")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("navigation", { name: /Páginas/ }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: /Ver la venta/ }))
      .not.toBeInTheDocument();
  });

  describe("selection", () => {
    it("selects the first sale once the list loads and reads its detail", async () => {
      const { screen, saleHistoryDetail } = await renderScreen();

      await expect
        .element(table(screen).getByRole("row", { name: /11:42/ }))
        .toHaveAttribute("aria-current", "true");
      await expect.element(detailPanel(screen).getByText("VENTA · 11:42")).toBeVisible();
      expect(saleHistoryDetail).toHaveBeenCalledWith("sale-1");
    });

    it("selects the sale whose row is clicked and shows its detail", async () => {
      const { screen, saleHistoryDetail } = await renderScreen();
      await expect.element(detailPanel(screen).getByText("VENTA · 11:42")).toBeVisible();

      await chooseSale(screen, "10:20");

      await expect
        .element(table(screen).getByRole("row", { name: /10:20/ }))
        .toHaveAttribute("aria-current", "true");
      expect(saleHistoryDetail).toHaveBeenCalledWith("sale-2");
    });

    it("moves the selection with the arrow keys, without Tab", async () => {
      const { screen } = await renderScreen();
      await expect
        .element(table(screen).getByRole("row", { name: /11:42/ }))
        .toHaveAttribute("aria-current", "true");

      await userEvent.keyboard("{ArrowDown}");
      await expect
        .element(table(screen).getByRole("row", { name: /10:20/ }))
        .toHaveAttribute("aria-current", "true");
      await userEvent.keyboard("{ArrowUp}");

      await expect
        .element(table(screen).getByRole("row", { name: /11:42/ }))
        .toHaveAttribute("aria-current", "true");
    });

    it("stays on the last row of the only page when pressing down", async () => {
      const { screen, salesHistory } = await renderScreen();
      await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");

      await expect
        .element(table(screen).getByRole("row", { name: /09:37/ }))
        .toHaveAttribute("aria-current", "true");
      expect(salesHistory).toHaveBeenCalledTimes(1);
    });

    it("keeps the selected row in view while moving through a long page", async () => {
      const fifty = Array.from({ length: 50 }, (_, index) => ({
        ...FISCAL_ROW,
        sale_id: `sale-${index + 1}`,
        occurred_at: `2026-10-09T10:${String(index).padStart(2, "0")}:00.000-03:00`,
      }));
      const { screen } = await renderScreen({ salesHistory: async () => pageOf(fifty) });
      await expect.element(table(screen).getByText("10:00", { exact: true })).toBeVisible();

      await userEvent.keyboard("{ArrowDown}".repeat(49));

      await expect.element(table(screen).getByText("10:49", { exact: true })).toBeInViewport();
    });
  });

  describe("pages", () => {
    const FIRST_PAGE = [
      FISCAL_ROW,
      { ...FISCAL_ROW, sale_id: "sale-9", occurred_at: "2026-10-09T10:00:00.000-03:00" },
    ];
    const SECOND_PAGE = [
      { ...FISCAL_ROW, sale_id: "sale-10", occurred_at: "2026-10-09T09:00:00.000-03:00" },
      { ...FISCAL_ROW, sale_id: "sale-11", occurred_at: "2026-10-09T08:00:00.000-03:00" },
    ];
    const salesHistory = async ({ page }: { page: number }) =>
      page === 1
        ? { kind: "found" as const, rows: FIRST_PAGE, total: 4, page_size: 2 }
        : { kind: "found" as const, rows: SECOND_PAGE, total: 4, page_size: 2 };

    it("moves to the next page from the last row, selecting its first row", async () => {
      const { screen, salesHistory: read } = await renderScreen({ salesHistory });
      await expect.element(table(screen).getByText("10:00")).toBeVisible();

      await userEvent.keyboard("{ArrowDown}{ArrowDown}");

      await expect
        .element(table(screen).getByRole("row", { name: /09:00/ }))
        .toHaveAttribute("aria-current", "true");
      expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    });

    it("moves back to the previous page from the first row, selecting its last row", async () => {
      const { screen } = await renderScreen({ salesHistory });
      await expect.element(table(screen).getByText("10:00")).toBeVisible();
      await userEvent.keyboard("{ArrowDown}{ArrowDown}");
      await expect.element(table(screen).getByText("09:00")).toBeVisible();

      await userEvent.keyboard("{ArrowUp}");

      await expect
        .element(table(screen).getByRole("row", { name: /10:00/ }))
        .toHaveAttribute("aria-current", "true");
    });

    it("stays on the first row of the first page when pressing up", async () => {
      const { screen, salesHistory: read } = await renderScreen({ salesHistory });
      await expect.element(table(screen).getByText("10:00")).toBeVisible();

      await userEvent.keyboard("{ArrowUp}");

      await expect
        .element(table(screen).getByRole("row", { name: /11:42/ }))
        .toHaveAttribute("aria-current", "true");
      expect(read).toHaveBeenCalledTimes(1);
    });
  });

  describe("session choice", () => {
    it("reads the open session's sales first when a session is open", async () => {
      const { salesHistory } = await renderScreen();

      await vi.waitFor(() =>
        expect(salesHistory).toHaveBeenCalledWith({
          session: "open",
          state: "all",
          page: 1,
          document: undefined,
        }),
      );
    });

    it("reads every session's sales when none is open", async () => {
      const { salesHistory } = await renderScreen({ sessionOpen: false });

      await vi.waitFor(() =>
        expect(salesHistory).toHaveBeenCalledWith(expect.objectContaining({ session: "all" })),
      );
    });

    it("offers Esta sesión and Todas with the F3 key beside them", async () => {
      const { screen } = await renderScreen();

      await expect.element(screen.getByRole("radio", { name: "Esta sesión" })).toBeChecked();
      await expect.element(screen.getByRole("radio", { name: "Todas" })).not.toBeChecked();
      await expect.element(screen.getByText("F3", { exact: true })).toBeVisible();
    });

    it("switches to every session when Todas is clicked, showing the date with the time", async () => {
      const { screen, salesHistory } = await renderScreen();
      await expect.element(table(screen).getByText("11:42", { exact: true })).toBeVisible();

      await userEvent.click(screen.getByText("Todas", { exact: true }).last());

      await vi.waitFor(() =>
        expect(salesHistory).toHaveBeenLastCalledWith(
          expect.objectContaining({ session: "all", page: 1 }),
        ),
      );
      await expect.element(table(screen).getByText("09/10 11:42", { exact: true })).toBeVisible();
      await expect.element(detailPanel(screen).getByText("VENTA · 09/10 · 11:42")).toBeVisible();
    });

    it("toggles between the two with F3", async () => {
      const { screen, salesHistory } = await renderScreen();
      await expect.element(screen.getByRole("radio", { name: "Esta sesión" })).toBeChecked();

      await userEvent.keyboard("{F3}");
      await expect.element(screen.getByRole("radio", { name: "Todas" })).toBeChecked();
      await vi.waitFor(() =>
        expect(salesHistory).toHaveBeenLastCalledWith(expect.objectContaining({ session: "all" })),
      );
      await userEvent.keyboard("{F3}");

      await expect.element(screen.getByRole("radio", { name: "Esta sesión" })).toBeChecked();
    });
  });

  describe("search by document number", () => {
    it("has the placeholder and the F2 key, and F2 focuses the field", async () => {
      const { screen } = await renderScreen();

      await expect.element(searchField(screen)).toBeVisible();
      await expect.element(searchField(screen)).not.toHaveFocus();
      await userEvent.keyboard("{F2}");

      await expect.element(searchField(screen)).toHaveFocus();
    });

    it("searches live by point of sale and number as they are typed", async () => {
      const { screen, salesHistory } = await renderScreen();

      await userEvent.keyboard("{F2}");
      await userEvent.type(searchField(screen), "0003-00000187");

      await vi.waitFor(() =>
        expect(salesHistory).toHaveBeenLastCalledWith({
          session: "open",
          state: "all",
          page: 1,
          document: { pointOfSale: 3, number: 187 },
        }),
      );
    });

    it("searches digits alone as a number in any point of sale", async () => {
      const { screen, salesHistory } = await renderScreen();

      await userEvent.type(searchField(screen), "187");

      await vi.waitFor(() =>
        expect(salesHistory).toHaveBeenLastCalledWith(
          expect.objectContaining({ document: { pointOfSale: null, number: 187 } }),
        ),
      );
    });

    it("lists every sale again when the text is erased", async () => {
      const { screen, salesHistory } = await renderScreen();
      await userEvent.type(searchField(screen), "187");
      await userEvent.clear(searchField(screen));

      await vi.waitFor(() =>
        expect(salesHistory).toHaveBeenLastCalledWith(
          expect.objectContaining({ document: undefined }),
        ),
      );
    });

    it("selects the first of the sales found, with its detail", async () => {
      const { screen } = await renderScreen({
        salesHistory: async ({ document }) =>
          pageOf(document === undefined ? [FISCAL_ROW, DEFERRED_ROW] : [DEFERRED_ROW]),
      });
      await userEvent.type(searchField(screen), "187");

      await expect
        .element(table(screen).getByRole("row", { name: /10:20/ }))
        .toHaveAttribute("aria-current", "true");
      await expect.element(table(screen).getByText("11:42")).not.toBeInTheDocument();
    });

    it("says no sale has that number when nothing matches", async () => {
      const { screen } = await renderScreen({
        salesHistory: async ({ document }) => pageOf(document === undefined ? [FISCAL_ROW] : []),
      });
      await userEvent.type(searchField(screen), "187");

      await expect.element(screen.getByText("No hay ventas con ese número")).toBeVisible();
      await expect.element(table(screen).getByRole("columnheader", { name: "Hora" })).toBeVisible();
      await expect.element(searchField(screen)).not.toBeInvalid();
    });

    it("marks the field invalid and says no sale has that number when the text is not a number", async () => {
      const { screen } = await renderScreen();

      await userEvent.type(searchField(screen), "abc");

      await expect.element(searchField(screen)).toBeInvalid();
      await expect.element(screen.getByText("No hay ventas con ese número")).toBeVisible();
      await expect.element(table(screen).getByText("11:42")).not.toBeInTheDocument();
    });
  });

  describe("states", () => {
    it("says there are no sales in the open session, with an empty detail and no footer keys", async () => {
      const { screen } = await renderScreen({ salesHistory: async () => pageOf([]) });

      await expect.element(screen.getByText("No hay ventas en la sesión abierta")).toBeVisible();
      await expect.element(table(screen).getByRole("columnheader", { name: "Hora" })).toBeVisible();
      await expect
        .element(detailPanel(screen).getByText("DETALLE DE LA VENTA", { exact: true }))
        .toBeVisible();
      await expect
        .element(detailPanel(screen).getByText("Elegí una venta para ver su detalle"))
        .toBeVisible();
      expect(legendOf(screen)).toEqual([]);
    });

    it("says there are no sales yet when every session is shown and none was made", async () => {
      const { screen } = await renderScreen({
        sessionOpen: false,
        salesHistory: async () => pageOf([]),
      });

      await expect.element(screen.getByText("Todavía no hay ventas")).toBeVisible();
    });

    it("shows no sale while they load", async () => {
      const { screen } = await renderScreen({ salesHistory: () => new Promise(() => {}) });

      await expect.element(table(screen)).toHaveAttribute("aria-busy", "true");
    });

    it("says the sales could not be read, offers R to read them again, and reads them again with it", async () => {
      let attempts = 0;
      const { screen, salesHistory } = await renderScreen({
        salesHistory: async () => {
          attempts += 1;
          return attempts === 1 ? { kind: "unavailable" } : pageOf([FISCAL_ROW]);
        },
      });

      await expect.element(screen.getByText("No se pudieron leer las ventas")).toBeVisible();
      await expect.element(screen.getByText("Volvé a intentarlo en unos segundos.")).toBeVisible();
      await expect.poll(() => legendOf(screen)).toEqual(["RReintentar"]);
      await expect
        .element(detailPanel(screen).getByText("Elegí una venta para ver su detalle"))
        .toBeVisible();
      await userEvent.keyboard("r");

      await expect.element(table(screen).getByText("11:42")).toBeVisible();
      expect(salesHistory).toHaveBeenCalledTimes(2);
    });

    it("says the person may not see the history, with the search and the session choice disabled and the Esc key in the panel", async () => {
      const { screen } = await renderScreen({
        salesHistory: async () => ({ kind: "lacks_permission" }),
      });

      await expect
        .element(screen.getByText("No tenés permiso para ver el historial de ventas"))
        .toBeVisible();
      await expect.element(table(screen).getByRole("columnheader", { name: "Hora" })).toBeVisible();
      await expect
        .element(detailPanel(screen).getByText("Elegí una venta para ver su detalle"))
        .not.toBeInTheDocument();
      await expect.element(searchField(screen)).toBeDisabled();
      await expect.element(screen.getByRole("radio", { name: "Todas" })).toBeDisabled();
      await expect
        .element(detailPanel(screen).getByText("DETALLE DE LA VENTA", { exact: true }))
        .toBeVisible();
      await expect.element(detailPanel(screen).getByText("Esc", { exact: true })).toBeVisible();
    });

    it("says the session is over when the core says nobody is signed in, with the controls disabled", async () => {
      const { screen } = await renderScreen({
        salesHistory: async () => ({ kind: "not_signed_in" }),
      });

      await expect
        .element(screen.getByText("La sesión terminó. Volvé a ingresar para ver las ventas"))
        .toBeVisible();
      await expect.element(table(screen).getByRole("columnheader", { name: "Hora" })).toBeVisible();
      await expect
        .element(detailPanel(screen).getByText("Elegí una venta para ver su detalle"))
        .not.toBeInTheDocument();
      await expect.element(searchField(screen)).toBeDisabled();
      await expect.element(detailPanel(screen).getByText("Esc", { exact: true })).toBeVisible();
    });

    it("keeps the list when the detail cannot be read, says so in the panel and reads it again with R", async () => {
      let attempts = 0;
      const { screen } = await renderScreen({
        saleHistoryDetail: async () => {
          attempts += 1;
          return attempts === 1 ? { kind: "unavailable" } : { kind: "found", detail: DETAIL };
        },
      });

      await expect.element(detailPanel(screen).getByText("No se pudo leer la venta")).toBeVisible();
      await expect.element(table(screen).getByText("11:42")).toBeVisible();
      await expect.poll(() => legendOf(screen)).toEqual(["↑↓Ventas", "F2Buscar"]);
      await userEvent.keyboard("r");

      await expect.element(detailPanel(screen).getByText("VENTA · 11:42")).toBeVisible();
    });
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
          .getByRole("complementary", { name: "¿Salir de la caja?" })
          .getByRole("button", { name: "Salir" }),
      );

      expect(lock).toHaveBeenCalledOnce();
    });
  });
});
