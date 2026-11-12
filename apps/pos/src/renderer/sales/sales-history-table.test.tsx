import type { SalesHistoryOutcome } from "@purosur/contracts";
import { ReceiptText } from "lucide-react";
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
  comprobante: {
    kind: "fiscal",
    document_type: "factura_c",
    authorization: "real_time",
    point_of_sale: 3,
    number: 1234,
  },
  operation_number: 482,
  payment_methods: ["CASH", "POINT"],
  total: 5_070_000,
  state: "completed",
};

function loaded(rows: Row[]): CoreData<ShownSalesHistory> {
  return {
    status: "loaded",
    value: { kind: "found", rows, total: rows.length, page_size: 50 },
    refreshing: false,
  };
}

async function renderTable(props: Partial<SalesHistoryTableProps> = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const onSelect = vi.fn();
  const screen = await render(
    <SalesHistoryTable
      history={loaded([ROW])}
      withDate={false}
      selectedSaleId={undefined}
      inactive={false}
      legend={[]}
      empty={{
        icon: <ReceiptText />,
        title: "No hay ventas en la sesión abierta",
        variant: "filtered",
      }}
      onSelect={onSelect}
      {...props}
    />,
  );
  return { screen, onSelect, table: screen.getByRole("table", { name: "Ventas" }) };
}

describe("SalesHistoryTable", () => {
  it("lists the time, comprobante on one line, methods, total and state of each sale", async () => {
    const { table } = await renderTable();

    for (const header of ["Hora", "Comprobante", "Medios", "Total", "Estado"]) {
      await expect.element(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    await expect.element(table.getByText("11:42", { exact: true })).toBeVisible();
    await expect.element(table.getByText("Factura C · 00003-00001234")).toBeVisible();
    await expect.element(table.getByText("Efectivo · Point")).toBeVisible();
    await expect.element(table.getByText("$ 50.700,00")).toBeVisible();
    await expect.element(table.getByText("Completada")).toBeVisible();
  });

  it("has no detail column nor operation number", async () => {
    const { table } = await renderTable();

    await expect
      .element(table.getByRole("columnheader", { name: "Detalle" }))
      .not.toBeInTheDocument();
    await expect.element(table.getByRole("button")).not.toBeInTheDocument();
    await expect.element(table.getByText(/Operación/)).not.toBeInTheDocument();
  });

  it("shows the date with the time when asked to", async () => {
    const { table } = await renderTable({ withDate: true });

    await expect.element(table.getByText("09/10 11:42", { exact: true })).toBeVisible();
  });

  it("shows only the time when the date is not asked for", async () => {
    const { table } = await renderTable({ withDate: false });

    await expect.element(table.getByText("09/10")).not.toBeInTheDocument();
  });

  it("names the document of a deferred sale as not fiscal and shows a dash when there is none", async () => {
    const { table } = await renderTable({
      history: loaded([
        { ...ROW, sale_id: "a", comprobante: { kind: "deferred_non_fiscal" }, state: "deferred" },
        { ...ROW, sale_id: "b", comprobante: { kind: "none" }, state: "in_progress" },
      ]),
    });

    await expect.element(table.getByText("Documento no fiscal")).toBeVisible();
    await expect.element(table.getByText("—").first()).toBeVisible();
    await expect.element(table.getByText("Diferida")).toBeVisible();
    await expect.element(table.getByText("En trámite")).toBeVisible();
  });

  it("shows a voided sale as Anulada", async () => {
    const { table } = await renderTable({ history: loaded([{ ...ROW, state: "voided" }]) });

    await expect.element(table.getByText("Anulada")).toBeVisible();
  });

  it("marks the selected sale", async () => {
    const { table } = await renderTable({
      history: loaded([
        ROW,
        { ...ROW, sale_id: "sale-2", occurred_at: "2026-10-09T10:20:00.000-03:00" },
      ]),
      selectedSaleId: "sale-2",
    });

    await expect
      .element(table.getByRole("row", { name: /10:20/ }))
      .toHaveAttribute("aria-current", "true");
    await expect
      .element(table.getByRole("row", { name: /11:42/ }))
      .not.toHaveAttribute("aria-current");
  });

  it("selects a sale when its row is clicked", async () => {
    const { table, onSelect } = await renderTable();

    await userEvent.click(table.getByText("11:42"));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith("sale-1");
  });

  it("does not select when the table is inactive", async () => {
    const { table, onSelect } = await renderTable({ inactive: true });

    await userEvent.click(table.getByText("11:42"));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows the key legend it is given", async () => {
    const { screen } = await renderTable({
      legend: [
        { keyName: "ArrowUpDown", label: "Ventas" },
        { keyName: "F2", label: "Buscar" },
      ],
    });

    await expect.element(screen.getByRole("listitem").first()).toHaveTextContent(/Ventas/);
    await expect.element(screen.getByRole("listitem").nth(1)).toHaveTextContent(/F2/);
    await expect.element(screen.getByRole("listitem").nth(1)).toHaveTextContent(/Buscar/);
  });

  it("shows no legend bar when it has no keys", async () => {
    const { screen } = await renderTable({ legend: [] });

    await expect.element(screen.getByRole("list")).not.toBeInTheDocument();
  });

  it("shows the empty state it is given", async () => {
    const { screen } = await renderTable({ history: loaded([]) });

    await expect.element(screen.getByText("No hay ventas en la sesión abierta")).toBeVisible();
  });

  it("shows no sale while they load", async () => {
    const { table } = await renderTable({ history: { status: "loading" } });

    await expect.element(table).toHaveAttribute("aria-busy", "true");
    await expect.element(table.getByText("11:42")).not.toBeInTheDocument();
  });

  it("says the sales could not be read, and has no retry button of its own", async () => {
    const { screen } = await renderTable({ history: { status: "failed", retry: vi.fn() } });

    await expect.element(screen.getByText("No se pudieron leer las ventas")).toBeVisible();
    await expect.element(screen.getByText("Volvé a intentarlo en unos segundos.")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Reintentar" }))
      .not.toBeInTheDocument();
  });
});
