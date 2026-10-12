import type { InitialCountLine } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CoreData } from "../platform/use-core-query";
import { InitialCountLines } from "./initial-count-lines";

const QUESO: InitialCountLine = {
  movement_id: "m1",
  product_id: "p1",
  product_name: "Queso cremoso",
  sale_unit: "KG",
  counted: 4400,
  expires_on: "2026-12-03",
};
const YERBA: InitialCountLine = {
  movement_id: "m2",
  product_id: "p2",
  product_name: "Yerba mate 1 kg",
  sale_unit: "UNIT",
  counted: 24_000,
  expires_on: null,
};

async function renderLines(
  state: CoreData<InitialCountLine[]>,
  { onWithdraw = vi.fn(), withdrawing = false } = {},
) {
  await page.viewport(1280, 720);
  const screen = await render(
    <InitialCountLines state={state} withdrawing={withdrawing} onWithdraw={onWithdraw} />,
  );
  return { screen, onWithdraw };
}

function loaded(lines: InitialCountLine[]): CoreData<InitialCountLine[]> {
  return { status: "loaded", value: lines, refreshing: false };
}

describe("InitialCountLines", () => {
  it("shows each line with its expiry or that it has none, and the quantity counted", async () => {
    const { screen } = await renderLines(loaded([QUESO, YERBA]));

    const rows = screen.getByRole("row");
    await expect.element(rows.nth(1)).toHaveTextContent("Queso cremoso");
    await expect.element(rows.nth(1)).toHaveTextContent("03/12/2026");
    await expect.element(rows.nth(1)).toHaveTextContent("4,400 kg");
    await expect.element(rows.nth(2)).toHaveTextContent("Yerba mate 1 kg");
    await expect.element(rows.nth(2)).toHaveTextContent("Sin vencimiento");
    await expect.element(rows.nth(2)).toHaveTextContent("24 u");
    await expectNoAccessibilityViolations(screen.container);
  });

  it("names the columns", async () => {
    const { screen } = await renderLines(loaded([QUESO]));

    await expect.element(screen.getByRole("columnheader", { name: "Producto" })).toBeVisible();
    await expect.element(screen.getByRole("columnheader", { name: "Vencimiento" })).toBeVisible();
    await expect.element(screen.getByRole("columnheader", { name: "Contado" })).toBeVisible();
  });

  it("counts the lines in the footer", async () => {
    const { screen } = await renderLines(loaded([QUESO, YERBA]));

    await expect.element(screen.getByText("2 líneas")).toBeVisible();
  });

  it("asks to withdraw the line of the button that is pressed", async () => {
    const { screen, onWithdraw } = await renderLines(loaded([QUESO, YERBA]));

    await userEvent.click(screen.getByRole("button", { name: "Quitar Yerba mate 1 kg" }));

    expect(onWithdraw).toHaveBeenCalledWith(YERBA);
  });

  it("tells there is nothing counted yet and how to start", async () => {
    const { screen } = await renderLines(loaded([]));

    await expect.element(screen.getByText("Todavía no cargaste ninguna línea")).toBeVisible();
    await expect
      .element(screen.getByText("Escaneá un producto o buscalo por nombre para cargar la primera."))
      .toBeVisible();
  });

  it("holds the places of the lines while they load", async () => {
    const { screen } = await renderLines({ status: "loading" });

    await expect
      .element(screen.getByText("Todavía no cargaste ninguna línea"))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole("table")).toBeVisible();
  });

  it("offers to read the lines again when they could not be read", async () => {
    const retry = vi.fn();
    const { screen } = await renderLines({ status: "failed", retry });

    await expect.element(screen.getByText("No se pudo leer lo cargado")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledOnce();
  });

  it("keeps the withdraw buttons from being pressed again while one withdrawal is going", async () => {
    const { screen } = await renderLines(loaded([QUESO]), { withdrawing: true });

    await expect
      .element(screen.getByRole("button", { name: "Quitar Queso cremoso" }))
      .toBeDisabled();
  });
});
