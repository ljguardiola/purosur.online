import { tokenRgb } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { ReturnLinesTableProps } from "./return-lines-table";
import { ReturnLinesTable } from "./return-lines-table";
import { NIBS, PASTA, TEA } from "./test-support/sale-for-return";

const ROWS: ReturnLinesTableProps["rows"] = [
  { line: PASTA, marked: true, quantity: 3, refund: 970_000, refused: false },
  { line: NIBS, marked: true, quantity: 400, refund: null, refused: true },
  { line: TEA, marked: false, quantity: undefined, refund: undefined, refused: false },
];

async function renderTable(overrides: Partial<ReturnLinesTableProps> = {}) {
  const onSelect = vi.fn();
  const onMark = vi.fn();
  const screen = await render(
    <div className="h-96">
      <ReturnLinesTable
        rows={ROWS}
        selectedLineId={PASTA.id}
        legend={[{ keyName: "Space", label: "Marcar" }]}
        onSelect={onSelect}
        onMark={onMark}
        {...overrides}
      />
    </div>,
  );
  return { screen, onSelect, onMark };
}

describe("ReturnLinesTable", () => {
  it("shows what was sold, what is returned and what is refunded of each marked line", async () => {
    const { screen } = await renderTable();

    await expect.element(screen.getByText("$ 9.700,00")).toBeVisible();
    await expect.element(screen.getByText("3 u", { exact: true }).nth(1)).toBeVisible();
    await expect.element(screen.getByText("0,400 kg")).toBeVisible();
  });

  it("shows a dash as the quantity and refund of a line that is not marked", async () => {
    const { screen } = await renderTable();

    const row = screen.getByRole("row", { name: /Té verde/ });
    await expect.poll(() => row.element().textContent).toMatch(/—\s*—\s*$/);
  });

  it("shows a refused quantity in red and no refund for it", async () => {
    const { screen } = await renderTable();

    const refused = screen.getByText("0,400 kg").element();
    expect(getComputedStyle(refused).color).toBe(tokenRgb("error-strong"));
    const row = screen.getByRole("row", { name: /Nibs de cacao/ });
    await expect.element(row.getByText("—")).toBeVisible();
  });

  it("marks the selected row as the current one", async () => {
    const { screen } = await renderTable();

    await expect
      .element(screen.getByRole("row", { name: /Pasta/ }))
      .toHaveAttribute("aria-current", "true");
  });

  it("selects a line when its row is pressed, without marking it", async () => {
    const { screen, onSelect, onMark } = await renderTable();

    await userEvent.click(screen.getByRole("row", { name: /Nibs de cacao/ }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith("line-nibs");
    expect(onMark).not.toHaveBeenCalled();
  });

  it("marks a line with its checkbox, and offers none for a line returned in full", async () => {
    const { screen, onMark } = await renderTable();

    const nibs = screen.getByRole("checkbox", { name: "Nibs de cacao" }).element();
    await userEvent.click(nibs.closest("label") as HTMLElement);

    await vi.waitFor(() => expect(onMark).toHaveBeenCalledExactlyOnceWith("line-nibs", false));
    await expect.element(screen.getByRole("checkbox", { name: /Té verde/ })).toBeDisabled();
    await expect.element(screen.getByText("Ya se devolvió completa")).toBeVisible();
  });

  it("says there are no sales when it has no row", async () => {
    const { screen } = await renderTable({ rows: [], selectedLineId: undefined });

    await expect.element(screen.getByText("Sin ventas")).toBeVisible();
  });
});
