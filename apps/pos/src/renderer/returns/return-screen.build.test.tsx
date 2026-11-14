import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  alertText,
  CASH_SALE,
  chooseReturnLine,
  legendOf,
  lineRow,
  linesTable,
  lookUp,
  markLine,
  openReturn,
  renderScreen,
  searchBox,
  selectLine,
  statusText,
} from "./test-support/return-screen";

function summary(screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) {
  return screen.getByRole("complementary", { name: "Resumen de la devolución" });
}

function rowOf(screen: Awaited<ReturnType<typeof renderScreen>>["screen"], product: string) {
  return linesTable(screen).getByRole("row", { name: new RegExp(product) });
}

describe("ReturnScreen showing the sale found by its ticket", () => {
  it("shows the sale's number in the search, every line with its sold quantity, and nothing marked", async () => {
    const { screen } = await renderScreen();

    await openReturn(screen);

    await expect.element(searchBox(screen)).toHaveValue("00003-00001192");
    for (const product of [
      "Pasta de maní 380 g",
      "Nibs de cacao",
      "Miel pura de abeja 1 kg",
      "Té verde en hebras 100 g",
    ]) {
      await expect.element(lineRow(screen, product)).toBeVisible();
    }
    await expect.element(linesTable(screen).getByText("0,350 kg")).toBeVisible();
    expect(
      screen
        .getByRole("checkbox")
        .elements()
        .filter((box) => (box as HTMLInputElement).checked),
    ).toHaveLength(0);
  });

  it("selects the first line and shows the sale in the summary panel with Esc", async () => {
    const { screen } = await renderScreen();

    await openReturn(screen);

    await expect
      .element(rowOf(screen, "Pasta de maní 380 g"))
      .toHaveAttribute("aria-current", "true");
    const panel = summary(screen);
    await expect.element(panel.getByText("A REINTEGRAR")).toBeVisible();
    await expect.poll(() => panel.element().textContent).toMatch(/A REINTEGRAR\s*\$\s*0,00/);
    await expect.element(panel.getByText("Factura C")).toBeVisible();
    await expect.element(panel.getByText("00003-00001192")).toBeVisible();
    await expect.element(panel.getByText("Venta", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("12/09 11:42")).toBeVisible();
    await expect.element(panel.getByText("Líneas a devolver")).toBeVisible();
    await expect.element(panel.getByText("Esc", { exact: true })).toBeVisible();
  });

  it("moves the selection with the up and down arrows", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);

    await userEvent.keyboard("{ArrowDown}");

    await expect.element(rowOf(screen, "Nibs de cacao")).toHaveAttribute("aria-current", "true");
    await userEvent.keyboard("{ArrowUp}");
    await expect
      .element(rowOf(screen, "Pasta de maní 380 g"))
      .toHaveAttribute("aria-current", "true");
  });

  it("marks and unmarks the selected line with Espacio, showing its quantity and refund and totalling the summary", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);

    await userEvent.keyboard(" ");

    await expect
      .element(rowOf(screen, "Pasta de maní 380 g").getByText("3 u", { exact: true }).nth(1))
      .toBeVisible();
    await expect
      .element(rowOf(screen, "Pasta de maní 380 g").getByText("$ 9.700,00"))
      .toBeVisible();
    await expect
      .poll(() => summary(screen).element().textContent)
      .toMatch(/A REINTEGRAR\s*\$\s*9\.700,00/);
    await expect.element(summary(screen).getByText("1", { exact: true })).toBeVisible();
    await expect.element(summary(screen).getByText("Efectivo · en el acto")).toBeVisible();
    await userEvent.keyboard(" ");
    await expect
      .poll(() => summary(screen).element().textContent)
      .toMatch(/A REINTEGRAR\s*\$\s*0,00/);
  });

  it("marks a line with its checkbox", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);

    await screen.getByRole("checkbox", { name: "Nibs de cacao" }).click({ force: true });

    await expect.element(rowOf(screen, "Nibs de cacao").getByText("$ 4.235,00")).toBeVisible();
  });

  it("shows a dash as the quantity and refund of a line that is not marked", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);

    await expect
      .poll(() => rowOf(screen, "Nibs de cacao").element().textContent)
      .toMatch(/—\s*—\s*$/);
  });

  it("does not let a fully returned line be marked", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);
    await expect
      .element(lineRow(screen, "Té verde en hebras 100 g").getByText("Ya se devolvió completa"))
      .toBeVisible();
    await selectLine(screen, "Té verde en hebras 100 g");

    await userEvent.keyboard(" ");

    await expect
      .poll(() => summary(screen).element().textContent)
      .toMatch(/A REINTEGRAR\s*\$\s*0,00/);
  });

  it("lists the arrows Líneas, Espacio Marcar and F6 Editar, then T Verificar, and Enter Completar once it can complete", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);

    expect(legendOf(screen)).toEqual(["↑↓Líneas", "EspacioMarcar", "F6Editar", "TVerificar"]);
    await markLine(screen, "Pasta de maní 380 g");
    await userEvent.keyboard("t");

    expect(legendOf(screen)).toEqual([
      "↑↓Líneas",
      "EspacioMarcar",
      "F6Editar",
      "TVerificar",
      "EnterCompletar",
    ]);
  });

  it("offers no Tab or F1 key", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);

    for (const key of legendOf(screen)) {
      expect(key).not.toMatch(/^(Tab|F1)/);
    }
  });

  it("has no accessibility violations", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);

    await expectNoAccessibilityViolations(document.body);
  });

  it("leaves to the empty search with Esc, forgetting the sale", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);
    await markLine(screen, "Pasta de maní 380 g");

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByText("Sin ventas")).toBeVisible();
    await expect.element(searchBox(screen)).toHaveValue("");
    await expect.element(searchBox(screen)).toHaveFocus();
  });

  it("previews the marked lines with the core, one request per change", async () => {
    const { screen, previewReturn } = await renderScreen();
    await openReturn(screen);

    await chooseReturnLine(screen, "Pasta de maní 380 g");

    await vi.waitFor(() =>
      expect(previewReturn).toHaveBeenLastCalledWith("sale-1", [
        {
          sale_line_id: "line-pasta",
          quantity: 3,
          reason: "change_of_mind",
          disposition: "restock",
          resolution: "refund",
        },
      ]),
    );
  });
});

describe("ReturnScreen showing a sale chosen from Historial", () => {
  it("looks the sale up by its id, without the ticket step, and shows no Ticket verificado nor T", async () => {
    const { screen, findSaleForReturn } = await renderScreen({ saleId: "sale-1" });

    await expect.element(lineRow(screen, "Pasta de maní 380 g")).toBeVisible();

    expect(findSaleForReturn).toHaveBeenCalledExactlyOnceWith(
      { kind: "sale", sale_id: "sale-1" },
      undefined,
    );
    await expect
      .element(screen.getByRole("checkbox", { name: "Ticket verificado" }))
      .not.toBeInTheDocument();
    expect(legendOf(screen)).toEqual(["↑↓Líneas", "EspacioMarcar", "F6Editar"]);
  });

  it("completes as soon as a line is marked, offering Enter Completar", async () => {
    const { screen } = await renderScreen({ saleId: "sale-1" });
    await expect.element(lineRow(screen, "Pasta de maní 380 g")).toBeVisible();

    await markLine(screen, "Pasta de maní 380 g");

    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeEnabled();
    await vi.waitFor(() =>
      expect(legendOf(screen)).toEqual(["↑↓Líneas", "EspacioMarcar", "F6Editar", "EnterCompletar"]),
    );
  });

  it("shows the lines table and the panel's figure loading, not the empty search, while it looks the sale up", async () => {
    const { screen } = await renderScreen({
      saleId: "sale-1",
      findSaleForReturn: () => new Promise(() => {}),
    });

    await expect.element(linesTable(screen)).toHaveAttribute("aria-busy", "true");
    await expect.element(screen.getByText("Sin ventas")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("complementary", { name: "Devolución" }).getByText("$ 0,00"))
      .not.toBeInTheDocument();
  });

  it("offers to look the sale up again when the core does not answer, and shows it once found", async () => {
    let answered = false;
    const { screen, findSaleForReturn } = await renderScreen({
      saleId: "sale-1",
      findSaleForReturn: vi.fn(async (reading) => {
        if (!answered) {
          answered = true;
          return { kind: "unavailable" } as const;
        }
        return {
          kind: "found",
          sale: { ...CASH_SALE },
          ticket_source: "HISTORY",
          ticket_verification_required: reading.kind !== "sale",
        } as const;
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(lineRow(screen, "Pasta de maní 380 g")).toBeVisible();
    expect(findSaleForReturn).toHaveBeenCalledTimes(2);
  });

  it("says why when the sale cannot be returned", async () => {
    const { screen } = await renderScreen({
      saleId: "sale-1",
      findSaleForReturn: async () => ({ kind: "voided" }),
    });

    await expect
      .element(alertText(screen, "Esa venta está anulada: no se puede devolver."))
      .toBeVisible();
  });

  it("replaces the failure to look the sale up with the answer to a ticket the cashier types", async () => {
    const { screen } = await renderScreen({
      saleId: "sale-1",
      findSaleForReturn: async (reading) =>
        reading.kind === "sale" ? { kind: "unavailable" } : { kind: "not_found" },
    });
    await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();

    await lookUp(screen, "0003-00009999");

    await expect
      .element(alertText(screen, "No encontramos esa venta en esta sucursal."))
      .toBeVisible();
    await expect.element(screen.getByText("No se pudo buscar la venta")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Reintentar" }))
      .not.toBeInTheDocument();
  });
});

describe("ReturnScreen refusing a line", () => {
  it("shows a refused quantity in red with an amber notice, leaves the line out of the total and blocks completing", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);
    await chooseReturnLine(screen, "Pasta de maní 380 g");
    await chooseReturnLine(screen, "Nibs de cacao");
    await selectLine(screen, "Pasta de maní 380 g");
    await userEvent.keyboard("{F6}");
    await userEvent.fill(screen.getByRole("textbox", { name: "Cantidad" }), "5");
    await userEvent.keyboard("{Enter}");

    await expect
      .element(statusText(screen, "Pasta de maní 380 g: se pueden devolver hasta 3 u."))
      .toBeVisible();
    await expect.element(rowOf(screen, "Pasta de maní 380 g").getByText("5 u")).toBeVisible();
    await expect
      .poll(() => summary(screen).element().textContent)
      .toMatch(/A REINTEGRAR\s*\$\s*4\.235,00/);
    await expect.element(summary(screen).getByText("1", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeDisabled();
    expect(legendOf(screen)).toEqual(["↑↓Líneas", "EspacioMarcar", "F6Editar"]);
  });
});

describe("ReturnScreen showing what it refunds", () => {
  it("shows $ 0,00, not loading, when the core refuses to preview the marked lines", async () => {
    const { screen } = await renderScreen({
      previewReturn: async () => ({ kind: "lacks_permission" }),
    });
    await openReturn(screen);

    await markLine(screen, "Pasta de maní 380 g");

    await expect
      .poll(() => summary(screen).element().textContent)
      .toMatch(/A REINTEGRAR\s*\$\s*0,00/);
  });

  it("shows $ 0,00, not loading, with the failure when the core does not answer the preview", async () => {
    const { screen } = await renderScreen({
      previewReturn: async () => ({ kind: "unavailable" }),
    });
    await openReturn(screen);

    await markLine(screen, "Pasta de maní 380 g");

    await expect
      .element(summary(screen).getByText("No se pudo calcular el reintegro"))
      .toBeVisible();
    await expect
      .poll(() => summary(screen).element().textContent)
      .toMatch(/A REINTEGRAR\s*\$\s*0,00/);
  });
});

describe("ReturnScreen once the sale is found", () => {
  it("starts a new search with what the cashier types in the search", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);

    await userEvent.type(searchBox(screen), "5");

    await expect.element(screen.getByText("Sin ventas")).toBeVisible();
    await expect.element(searchBox(screen)).toHaveValue("00003-000011925");
    await expect.element(screen.getByRole("button", { name: "Buscar" })).toBeEnabled();
  });
});
