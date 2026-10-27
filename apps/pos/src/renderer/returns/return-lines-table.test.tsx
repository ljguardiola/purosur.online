import type { ReturnLineRefusalBody } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { ReturnDraft } from "./return-draft";
import { checkLine, EMPTY_RETURN_DRAFT } from "./return-draft";
import { ReturnLinesTable } from "./return-lines-table";
import type { SaleForReturn } from "./return-sale";
import { HONEY, NIBS, PASTA, SALE, TEA } from "./test-support/sale-for-return";

type Overrides = {
  sale?: SaleForReturn;
  draft?: ReturnDraft;
  refusals?: Record<string, ReturnLineRefusalBody | null>;
};

async function renderTable({
  sale = SALE,
  draft = EMPTY_RETURN_DRAFT,
  refusals = {},
}: Overrides = {}) {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const onCheck = vi.fn();
  const onChange = vi.fn();
  const screen = await render(
    <ReturnLinesTable
      sale={sale}
      draft={draft}
      refusals={refusals}
      onCheck={onCheck}
      onChange={onChange}
    />,
  );
  return { screen, onCheck, onChange };
}

describe("ReturnLinesTable", () => {
  it("lists every line of the sale with what it sold and charged", async () => {
    const { screen } = await renderTable();

    const table = screen.getByRole("table", { name: "Líneas de la venta" });
    await expect.element(table.getByText("Pasta de maní 380 g")).toBeVisible();
    await expect.element(table.getByText("3 u · $ 9.700,00")).toBeVisible();
    await expect.element(table.getByText("Nibs de cacao")).toBeVisible();
    await expect.element(table.getByText("0,350 kg · $ 4.235,00")).toBeVisible();
    await expect.element(table.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  });

  it("names the columns of what the customer returns", async () => {
    const { screen } = await renderTable();

    for (const header of ["Producto", "Devuelve", "Motivo", "Se resuelve con", "Destino"]) {
      await expect.element(screen.getByRole("columnheader", { name: header })).toBeVisible();
    }
  });

  it("asks nothing of a line that is not checked", async () => {
    const { screen } = await renderTable();

    await expect
      .element(screen.getByRole("textbox", { name: "Cantidad de Pasta de maní 380 g" }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("checkbox", { name: /Pasta de maní 380 g/ }))
      .not.toBeChecked();
  });

  it("tells the screen which line the cashier checks", async () => {
    const { screen, onCheck } = await renderTable();

    await screen.getByRole("checkbox", { name: /Pasta de maní 380 g/ }).click({ force: true });

    expect(onCheck).toHaveBeenCalledExactlyOnceWith(PASTA, true);
  });

  it("tells the screen which line the cashier unchecks", async () => {
    const { screen, onCheck } = await renderTable({ draft: checkLine(EMPTY_RETURN_DRAFT, PASTA) });

    await screen.getByRole("checkbox", { name: /Pasta de maní 380 g/ }).click({ force: true });

    expect(onCheck).toHaveBeenCalledExactlyOnceWith(PASTA, false);
  });

  it("asks a checked line for its quantity, reason and destination, with nothing chosen", async () => {
    const { screen } = await renderTable({ draft: checkLine(EMPTY_RETURN_DRAFT, PASTA) });

    await expect
      .element(screen.getByRole("textbox", { name: "Cantidad de Pasta de maní 380 g" }))
      .toHaveValue("3");
    await expect
      .element(screen.getByRole("button", { name: /Motivo de Pasta de maní 380 g/ }))
      .toHaveTextContent("Elegí");
    await expect
      .element(screen.getByRole("button", { name: /Destino de Pasta de maní 380 g/ }))
      .toHaveTextContent("Elegí");
    await expect.element(screen.getByText("Reintegro")).toBeVisible();
  });

  it("tells the screen the quantity the cashier types", async () => {
    const { screen, onChange } = await renderTable({ draft: checkLine(EMPTY_RETURN_DRAFT, PASTA) });

    await userEvent.fill(
      screen.getByRole("textbox", { name: "Cantidad de Pasta de maní 380 g" }),
      "2",
    );

    expect(onChange).toHaveBeenLastCalledWith(PASTA.id, { quantity: "2" });
  });

  it("types the quantity of a weighed line as a weight", async () => {
    const { screen } = await renderTable({ draft: checkLine(EMPTY_RETURN_DRAFT, NIBS) });

    await expect
      .element(screen.getByRole("textbox", { name: "Cantidad de Nibs de cacao" }))
      .toHaveValue("0,350");
  });

  it("tells the screen the reason and the destination the cashier chooses", async () => {
    const { screen, onChange } = await renderTable({ draft: checkLine(EMPTY_RETURN_DRAFT, PASTA) });

    await userEvent.click(screen.getByRole("button", { name: /Motivo de Pasta de maní 380 g/ }));
    await userEvent.click(screen.getByRole("option", { name: "Defecto" }));
    await userEvent.click(screen.getByRole("button", { name: /Destino de Pasta de maní 380 g/ }));
    await userEvent.click(screen.getByRole("option", { name: "Descarte" }));

    expect(onChange).toHaveBeenCalledWith(PASTA.id, { reason: "defective" });
    expect(onChange).toHaveBeenCalledWith(PASTA.id, { disposition: "discard" });
  });

  it("marks the reason whose window is over", async () => {
    const { screen } = await renderTable({
      sale: {
        ...SALE,
        windows: {
          ...SALE.windows,
          change_of_mind: { last_allowed_day: "2026-09-12", open: false },
        },
      },
      draft: checkLine(EMPTY_RETURN_DRAFT, PASTA),
    });

    await userEvent.click(screen.getByRole("button", { name: /Motivo de Pasta de maní 380 g/ }));

    await expect
      .element(screen.getByRole("option", { name: /Arrepentimiento/ }))
      .toHaveTextContent(/Vencido/);
    await expect
      .element(screen.getByRole("option", { name: "Defecto" }))
      .not.toHaveTextContent(/Vencido/);
  });

  it("returns a line that must go back whole in all its remaining quantity, with the reason it cannot change", async () => {
    const { screen } = await renderTable({ draft: checkLine(EMPTY_RETURN_DRAFT, HONEY) });

    const quantity = screen.getByRole("textbox", { name: "Cantidad de Miel pura de abeja 1 kg" });
    await expect.element(quantity).toHaveValue("2");
    await expect.element(quantity).toHaveAttribute("readonly");
    await userEvent.hover(quantity);
    await expect.element(screen.getByText("Las promociones se devuelven completas")).toBeVisible();
  });

  it("does not let a line already returned in full be checked", async () => {
    const { screen } = await renderTable();

    await expect
      .element(screen.getByRole("checkbox", { name: /Té verde en hebras 100 g/ }))
      .toBeDisabled();
    await expect.element(screen.getByText("Ya se devolvió completa")).toBeVisible();
    expect(TEA.returnable_quantity).toBe(0);
  });

  it("says how much is left to return of a line returned in part", async () => {
    const { screen } = await renderTable({
      sale: {
        ...SALE,
        lines: [{ ...PASTA, returned_quantity: 1, returnable_quantity: 2 }],
      },
    });

    await expect
      .element(screen.getByText("3 u · $ 9.700,00 · se pueden devolver 2 u"))
      .toBeVisible();
  });

  it("highlights the line the core refuses, and no other", async () => {
    const { screen } = await renderTable({
      draft: checkLine(checkLine(EMPTY_RETURN_DRAFT, PASTA), NIBS),
      refusals: { [PASTA.id]: { kind: "missing_reason" }, [NIBS.id]: null },
    });

    const background = (name: string) =>
      getComputedStyle(
        screen
          .getByRole("checkbox", { name: new RegExp(name) })
          .element()
          .closest("tr") as HTMLElement,
      ).backgroundColor;
    expect(background("Pasta de maní 380 g")).not.toBe(background("Nibs de cacao"));
  });

  it("has no accessibility violations", async () => {
    const { screen } = await renderTable({
      draft: checkLine(checkLine(EMPTY_RETURN_DRAFT, PASTA), HONEY),
    });

    await expectNoAccessibilityViolations(screen.container);
  });
});
