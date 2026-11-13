import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type { RenderedScreen } from "./test-support/return-screen";
import {
  legendOf,
  linesTable,
  markLine,
  openReturn,
  renderScreen,
  selectLine,
} from "./test-support/return-screen";

async function openLineEditor(screen: RenderedScreen, product: string) {
  await openReturn(screen);
  await markLine(screen, product);
  await userEvent.keyboard("{F6}");
}

function linePanel(screen: RenderedScreen) {
  return screen.getByRole("complementary", { name: "Editar la línea" });
}

describe("ReturnScreen editing a line", () => {
  it("replaces the summary with the line's panel on F6, showing its name, Esc, refund and sold quantity", async () => {
    const { screen } = await renderScreen();

    await openLineEditor(screen, "Nibs de cacao");

    const panel = linePanel(screen);
    await expect.element(panel.getByText("NIBS DE CACAO")).toBeVisible();
    await expect.element(panel.getByText("Esc", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("$ 4.235,00")).toBeVisible();
    await expect.element(panel.getByText("Vendido")).toBeVisible();
    await expect.element(panel.getByText("0,350 kg")).toBeVisible();
    await expect
      .element(screen.getByRole("complementary", { name: "Resumen de la devolución" }))
      .not.toBeInTheDocument();
  });

  it("opens it with Cantidad focused and the first option of each group selected", async () => {
    const { screen } = await renderScreen();

    await openLineEditor(screen, "Nibs de cacao");

    await expect.element(screen.getByRole("textbox", { name: "Cantidad" })).toHaveFocus();
    await expect.element(screen.getByRole("textbox", { name: "Cantidad" })).toHaveValue("0,350");
    await expect.element(screen.getByRole("radio", { name: "Arrepentimiento" })).toBeChecked();
    await expect.element(screen.getByRole("radio", { name: "Reintegro" })).toBeChecked();
    await expect.element(screen.getByRole("radio", { name: "A la venta" })).toBeChecked();
    for (const option of ["Defecto", "Descarte"]) {
      await expect.element(screen.getByRole("radio", { name: option })).not.toBeChecked();
    }
  });

  it("names the exchange Cambio and offers it only when the sale offers it for the reason", async () => {
    const { screen } = await renderScreen();
    await openLineEditor(screen, "Nibs de cacao");

    await expect.element(screen.getByRole("radio", { name: "Cambio" })).not.toBeInTheDocument();
    await screen.getByRole("radio", { name: "Defecto" }).click({ force: true });

    await expect.element(screen.getByRole("radio", { name: "Cambio" })).toBeVisible();
    await expect
      .element(screen.getByText("Cambio por otra igual", { exact: true }))
      .not.toBeInTheDocument();
  });

  it("lists 0-9 Cantidad, Tab Campo, the arrows Opción and Enter Aplicar, and no F1", async () => {
    const { screen } = await renderScreen();

    await openLineEditor(screen, "Nibs de cacao");

    expect(legendOf(screen)).toEqual(["0-9Cantidad", "TabCampo", "←→Opción", "EnterAplicar"]);
    await expect.element(linePanel(screen).getByRole("button", { name: "Aplicar" })).toBeVisible();
  });

  it("moves between Cantidad, Motivo, Resolución and Destino with Tab, and back with Shift+Tab", async () => {
    const { screen } = await renderScreen();
    await openLineEditor(screen, "Nibs de cacao");

    await userEvent.tab();
    await expect.element(screen.getByRole("radio", { name: "Arrepentimiento" })).toHaveFocus();
    await userEvent.tab();
    await expect.element(screen.getByRole("radio", { name: "Reintegro" })).toHaveFocus();
    await userEvent.tab();
    await expect.element(screen.getByRole("radio", { name: "A la venta" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect.element(screen.getByRole("radio", { name: "Reintegro" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    await expect.element(screen.getByRole("textbox", { name: "Cantidad" })).toHaveFocus();
  });

  it("changes the focused group's option with the left and right arrows", async () => {
    const { screen } = await renderScreen();
    await openLineEditor(screen, "Nibs de cacao");
    await userEvent.tab();

    await userEvent.keyboard("{ArrowRight}");

    await expect.element(screen.getByRole("radio", { name: "Defecto" })).toBeChecked();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(screen.getByRole("radio", { name: "Arrepentimiento" })).toBeChecked();
  });

  it("applies the edit on Enter, going back to the summary with the new quantity, reason and destination previewed", async () => {
    const { screen, previewReturn } = await renderScreen();
    await openLineEditor(screen, "Pasta de maní 380 g");

    await userEvent.fill(screen.getByRole("textbox", { name: "Cantidad" }), "2");
    await screen.getByRole("radio", { name: "Defecto" }).click({ force: true });
    await screen.getByRole("radio", { name: "Descarte" }).click({ force: true });
    await userEvent.keyboard("{Enter}");

    await expect
      .element(screen.getByRole("complementary", { name: "Resumen de la devolución" }))
      .toBeVisible();
    await expect.element(linesTable(screen).getByText("2 u", { exact: true }).nth(1)).toBeVisible();
    expect(previewReturn).toHaveBeenLastCalledWith("sale-1", [
      {
        sale_line_id: "line-pasta",
        quantity: 2,
        reason: "defective",
        disposition: "discard",
        resolution: "refund",
      },
    ]);
  });

  it("applies it with the Aplicar button too", async () => {
    const { screen } = await renderScreen();
    await openLineEditor(screen, "Pasta de maní 380 g");
    await userEvent.fill(screen.getByRole("textbox", { name: "Cantidad" }), "1");

    await userEvent.click(linePanel(screen).getByRole("button", { name: "Aplicar" }));

    await expect.element(linesTable(screen).getByText("1 u", { exact: true })).toBeVisible();
  });

  it("discards the edit and goes back to the summary on Esc", async () => {
    const { screen } = await renderScreen();
    await openLineEditor(screen, "Pasta de maní 380 g");
    await userEvent.fill(screen.getByRole("textbox", { name: "Cantidad" }), "1");

    await userEvent.keyboard("{Escape}");

    await expect
      .element(screen.getByRole("complementary", { name: "Resumen de la devolución" }))
      .toBeVisible();
    await expect
      .element(linesTable(screen).getByText("1 u", { exact: true }))
      .not.toBeInTheDocument();
  });

  it("opens the editor of a line that is not marked, marking it when applied", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);
    await selectLine(screen, "Nibs de cacao");

    await userEvent.keyboard("{F6}");
    await expect.element(linePanel(screen)).toBeVisible();
    await userEvent.keyboard("{Enter}");

    await expect.element(linesTable(screen).getByText("$ 4.235,00")).toBeVisible();
  });

  it("does not move the selection while the editor is open", async () => {
    const { screen } = await renderScreen();
    await openLineEditor(screen, "Nibs de cacao");

    await userEvent.keyboard("{ArrowDown}");

    await expect.element(linePanel(screen).getByText("NIBS DE CACAO")).toBeVisible();
  });
});
