import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  chooseReturnLine,
  legendOf,
  linesTable,
  markLine,
  openReturn,
  renderScreen,
  searchBox,
  selectLine,
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

    await expect.element(searchBox(screen)).toHaveValue("0003-00001192");
    for (const product of [
      "Pasta de maní 380 g",
      "Nibs de cacao",
      "Miel pura de abeja 1 kg",
      "Té verde en hebras 100 g",
    ]) {
      await expect.element(linesTable(screen).getByText(product, { exact: true })).toBeVisible();
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
    await expect.element(panel.getByText("$ 0,00").first()).toBeVisible();
    await expect.element(panel.getByText("Factura C")).toBeVisible();
    await expect.element(panel.getByText("0003-00001192")).toBeVisible();
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
    await expect.element(summary(screen).getByText("$ 9.700,00").first()).toBeVisible();
    await expect.element(summary(screen).getByText("1", { exact: true })).toBeVisible();
    await expect.element(summary(screen).getByText("Efectivo · en el acto")).toBeVisible();
    await userEvent.keyboard(" ");
    await expect.element(summary(screen).getByText("$ 0,00").first()).toBeVisible();
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

    await expect.element(rowOf(screen, "Nibs de cacao").getByText("—").first()).toBeVisible();
  });

  it("does not let a fully returned line be marked", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);
    await selectLine(screen, "Té verde en hebras 100 g");

    await userEvent.keyboard(" ");

    await expect.element(summary(screen).getByText("$ 0,00").first()).toBeVisible();
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

    await expect.element(linesTable(screen).getByText("Sin ventas")).toBeVisible();
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

    await expect.element(linesTable(screen).getByText("Pasta de maní 380 g")).toBeVisible();

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
    await expect.element(linesTable(screen).getByText("Pasta de maní 380 g")).toBeVisible();

    await markLine(screen, "Pasta de maní 380 g");

    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeEnabled();
    await vi.waitFor(() =>
      expect(legendOf(screen)).toEqual(["↑↓Líneas", "EspacioMarcar", "F6Editar", "EnterCompletar"]),
    );
  });

  it("says why when the sale cannot be returned", async () => {
    const { screen } = await renderScreen({
      saleId: "sale-1",
      findSaleForReturn: async () => ({ kind: "voided" }),
    });

    await expect
      .element(screen.getByText("Esa venta está anulada: no se puede devolver."))
      .toBeVisible();
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
      .element(screen.getByText("Pasta de maní 380 g: se pueden devolver hasta 3 u."))
      .toBeVisible();
    await expect.element(rowOf(screen, "Pasta de maní 380 g").getByText("5 u")).toBeVisible();
    await expect.element(summary(screen).getByText("$ 4.235,00").first()).toBeVisible();
    await expect.element(summary(screen).getByText("1", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeDisabled();
    expect(legendOf(screen)).toEqual(["↑↓Líneas", "EspacioMarcar", "F6Editar"]);
  });
});
