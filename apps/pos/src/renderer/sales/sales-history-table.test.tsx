import type { SalesHistoryOutcome } from "@purosur/contracts";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { CoreData } from "../platform/use-core-query";
import { render } from "../shell/test-support/render-with-router";
import type { SalesHistoryTableProps } from "./sales-history-table";
import { SalesHistoryTable } from "./sales-history-table";
import type { ShownSalesHistory } from "./sales-queries";

type Row = Extract<SalesHistoryOutcome, { kind: "found" }>["rows"][number];

const ROW: Row = {
  sale_id: "sale-1",
  occurred_at: "2026-10-09T11:42:00.000-03:00",
  comprobante: { kind: "none" },
  operation_number: 482,
  payment_methods: ["CASH"],
  total: 5_070_000,
  state: "completed",
};

function loaded(rows: Row[], total = rows.length): CoreData<ShownSalesHistory> {
  return {
    status: "loaded",
    value: { kind: "found", rows, total, page_size: 50 },
    refreshing: false,
  };
}

async function renderTable(props: Partial<SalesHistoryTableProps> = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const handlers = {
    onSessionChange: vi.fn(),
    onStateChange: vi.fn(),
    onPageChange: vi.fn(),
    onSelect: vi.fn(),
  };
  const screen = await render(
    <SalesHistoryTable
      history={loaded([ROW])}
      session="all"
      state="all"
      page={1}
      selectedSaleId={undefined}
      {...handlers}
      {...props}
    />,
  );
  return { screen, ...handlers };
}

describe("SalesHistoryTable", () => {
  it("says there are no sales yet when no filter hides any", async () => {
    const { screen } = await renderTable({ history: loaded([]) });

    await expect.element(screen.getByText("Todavía no hay ventas")).toBeVisible();
  });

  it("says the open session has no sales when only the session filter is chosen", async () => {
    const { screen } = await renderTable({ history: loaded([]), session: "open" });

    await expect.element(screen.getByText("No hay ventas en la sesión abierta")).toBeVisible();
    await expect.element(screen.getByText("Todavía no hay ventas")).not.toBeInTheDocument();
  });

  it.each(["open", "all"] as const)(
    "says no sale is in the state chosen, in %s sessions",
    async (session) => {
      const { screen } = await renderTable({ history: loaded([]), session, state: "deferred" });

      await expect.element(screen.getByText("No hay ventas en ese estado")).toBeVisible();
    },
  );

  it("says how many sales there are when they fit in one page", async () => {
    const { screen } = await renderTable({ history: loaded([ROW, { ...ROW, sale_id: "s2" }]) });

    await expect.element(screen.getByText("2 ventas", { exact: true })).toBeVisible();
  });

  it("says which sales of how many the page shows, up to the total on the last page", async () => {
    const { screen } = await renderTable({ history: loaded([ROW], 128), page: 3 });

    await expect.element(screen.getByText("101 a 128 de 128 ventas")).toBeVisible();
  });

  it("reports the page chosen", async () => {
    const { screen, onPageChange } = await renderTable({ history: loaded([ROW], 128) });

    await userEvent.click(screen.getByRole("button", { name: "Página 2" }));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("reports the session and the state chosen", async () => {
    const { screen, onSessionChange, onStateChange } = await renderTable();

    await userEvent.click(screen.getByRole("button", { name: "Sesión: Todas" }));
    await userEvent.click(screen.getByRole("option", { name: "La abierta" }));
    await userEvent.click(screen.getByRole("button", { name: "Estado: Todos" }));
    await userEvent.click(screen.getByRole("option", { name: "En trámite" }));

    expect(onSessionChange).toHaveBeenCalledWith("open");
    expect(onStateChange).toHaveBeenCalledWith("in_progress");
  });

  it("reports the sale whose detail is asked for", async () => {
    const { screen, onSelect } = await renderTable();

    await userEvent.click(screen.getByRole("button", { name: "Ver la venta de las 11:42" }));

    expect(onSelect).toHaveBeenCalledWith("sale-1");
  });

  it("says the sales could not be read and retries from Reintentar", async () => {
    const retry = vi.fn();
    const { screen } = await renderTable({ history: { status: "failed", retry } });

    await expect.element(screen.getByText("No se pudieron leer las ventas")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
