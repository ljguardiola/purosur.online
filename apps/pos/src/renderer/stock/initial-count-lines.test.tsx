import type { InitialCountLine } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { Ban } from "lucide-react";
import type { ComponentProps } from "react";
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

const LEGEND = [
  { keyName: "ArrowUpDown", label: "Líneas" },
  { keyName: "Delete", label: "Quitar" },
] as const;

async function renderLines(
  state: CoreData<InitialCountLine[]>,
  props: Partial<ComponentProps<typeof InitialCountLines>> = {},
) {
  await page.viewport(1280, 720);
  const onSelect = vi.fn();
  const screen = await render(
    <div style={{ height: 600, display: "flex", flexDirection: "column" }}>
      <InitialCountLines
        state={state}
        selectedLineId={undefined}
        legend={[]}
        onSelect={onSelect}
        {...props}
      />
    </div>,
  );
  return { screen, onSelect };
}

function loaded(lines: InitialCountLine[]): CoreData<InitialCountLine[]> {
  return { status: "loaded", value: lines, refreshing: false };
}

describe("InitialCountLines", () => {
  it("shows each line with its expiry or that it has none, and the quantity counted", async () => {
    const { screen } = await renderLines(loaded([QUESO, YERBA]));

    const rows = screen.getByRole("row");
    await expect.element(rows.nth(1)).toHaveTextContent("Queso cremoso03/12/20264,400 kg");
    await expect.element(rows.nth(2)).toHaveTextContent("Yerba mate 1 kg— Sin vencimiento24 u");
    await expectNoAccessibilityViolations(screen.container);
  });

  it("names the columns", async () => {
    const { screen } = await renderLines(loaded([QUESO]));

    await expect.element(screen.getByRole("columnheader", { name: "Producto" })).toBeVisible();
    await expect.element(screen.getByRole("columnheader", { name: "Vencimiento" })).toBeVisible();
    await expect.element(screen.getByRole("columnheader", { name: "Contado" })).toBeVisible();
  });

  it("draws no calendar icon in the expiry cell and no footer counting the lines", async () => {
    const { screen } = await renderLines(loaded([QUESO, YERBA]));

    await expect.element(screen.getByRole("row").nth(1)).toBeVisible();
    expect(screen.getByRole("row").nth(1).element().querySelector("svg")).toBeNull();
    await expect.element(screen.getByText("2 líneas")).not.toBeInTheDocument();
  });

  it("has no column of actions and no button to withdraw a line", async () => {
    const { screen } = await renderLines(loaded([QUESO, YERBA]));

    await expect.element(screen.getByRole("columnheader")).toHaveLength(3);
    await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
  });

  it("marks the selected line as current", async () => {
    const { screen } = await renderLines(loaded([QUESO, YERBA]), { selectedLineId: "m2" });

    await expect.element(screen.getByRole("row").nth(2)).toHaveAttribute("aria-current", "true");
    await expect.element(screen.getByRole("row").nth(1)).not.toHaveAttribute("aria-current");
  });

  it("selects the line that is pressed", async () => {
    const { screen, onSelect } = await renderLines(loaded([QUESO, YERBA]));

    await userEvent.click(screen.getByRole("cell", { name: "Yerba mate 1 kg" }));

    expect(onSelect).toHaveBeenCalledWith(YERBA);
  });

  it("draws the given keys as the card's legend", async () => {
    const { screen } = await renderLines(loaded([QUESO]), { legend: LEGEND });

    await expect.element(screen.getByRole("listitem").first()).toHaveTextContent("↑↓Líneas");
    await expect.element(screen.getByRole("listitem").last()).toHaveTextContent("SuprQuitar");
  });

  it("tells there is nothing counted yet, with the column headers kept and no help text", async () => {
    const { screen } = await renderLines(loaded([]));

    await expect.element(screen.getByText("Todavía no cargaste ninguna línea")).toBeVisible();
    await expect.element(screen.getByRole("columnheader")).toHaveLength(3);
    await expect
      .element(screen.getByText("Escaneá un producto o buscalo por nombre para cargar la primera."))
      .not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("tells instead the given reason why nothing can be counted, over the same headers", async () => {
    const { screen } = await renderLines(loaded([QUESO]), {
      unavailable: {
        icon: <Ban />,
        title: "La carga del inventario inicial ya no está disponible",
      },
    });

    await expect
      .element(screen.getByText("La carga del inventario inicial ya no está disponible"))
      .toBeVisible();
    await expect.element(screen.getByRole("columnheader")).toHaveLength(3);
    await expect
      .element(screen.getByRole("cell", { name: "Queso cremoso" }))
      .not.toBeInTheDocument();
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
});
