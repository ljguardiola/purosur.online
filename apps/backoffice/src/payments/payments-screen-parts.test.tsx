import { Table, useTableModel } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { render, renderHook } from "vitest-browser-react";
import {
  amountColumn,
  type FilterOptions,
  methodColumn,
  methodFilterOptions,
  type PendingRefund,
  pendingSinceColumn,
  reasonColumn,
  registerFilterOptions,
  useOfferedChoice,
  useReportedFilters,
} from "./payments-screen-parts";
import {
  latePaymentRefund,
  noPendingRefunds,
  pendingRefunds,
  transferRefund,
  unconfirmedCloudRefund,
} from "./test-support/refund-fixtures";

test("offers every register once, sorted by name, after the option for all of them", () => {
  const refunds = [latePaymentRefund, transferRefund, { ...transferRefund, id: "another" }];

  expect(registerFilterOptions(refunds)).toEqual([
    { value: "all", label: "Todas" },
    { value: latePaymentRefund.register_id, label: "Caja del frente" },
    { value: transferRefund.register_id, label: "Caja principal" },
  ]);
});

test("offers only the option for all registers when there are no refunds", () => {
  expect(registerFilterOptions(noPendingRefunds.refunds)).toEqual([
    { value: "all", label: "Todas" },
  ]);
});

test("offers every method once, labelled and sorted by label, after the option for all of them", () => {
  const refunds = [
    transferRefund,
    { ...transferRefund, id: "another" },
    { ...transferRefund, id: "point", method: "POINT" as const },
    { ...transferRefund, id: "qr", method: "QR" as const },
  ];

  expect(methodFilterOptions(refunds)).toEqual([
    { value: "all", label: "Todos" },
    { value: "POINT", label: "Point integrada" },
    { value: "QR", label: "QR de Mercado Pago" },
    { value: "TRANSFER", label: "Transferencia" },
  ]);
});

test("offers one method for refunds that share it", () => {
  expect(methodFilterOptions(pendingRefunds.refunds)).toEqual([
    { value: "all", label: "Todos" },
    { value: "TRANSFER", label: "Transferencia" },
  ]);
});

function ColumnsTable({ refunds }: { refunds: PendingRefund[] }) {
  const table = useTableModel({
    items: refunds,
    id: (refund) => refund.id,
    columns: [pendingSinceColumn, reasonColumn, methodColumn, amountColumn],
  });
  return <Table aria-label="Reembolsos" table={table} />;
}

function rowTexts(screen: Awaited<ReturnType<typeof render>>) {
  return screen
    .getByRole("row")
    .all()
    .slice(1)
    .map((row) => row.element().textContent ?? "");
}

test("heads the refund columns by since when, why, how and how much", async () => {
  const screen = await render(<ColumnsTable refunds={[transferRefund]} />);

  const headers = screen
    .getByRole("columnheader")
    .all()
    .map((header) => header.element().textContent?.trim());
  expect(headers).toEqual(["Pendiente desde", "Por qué", "Medio", "Importe"]);
});

test("shows since when a refund is pending, why, its method alone and its amount", async () => {
  const screen = await render(<ColumnsTable refunds={[transferRefund]} />);

  await expect.poll(() => rowTexts(screen)).toHaveLength(1);
  const [row] = rowTexts(screen);
  expect(row).toContain("07/10/2026");
  expect(row).toContain("hace 3 horas");
  expect(row).toContain("Venta cancelada");
  expect(row).toContain("La venta del 07/10 12:30 se canceló · la canceló Lucía");
  expect(row).toContain("Transferencia");
  expect(row).toContain("$ 2.500,00");
});

test("names the Mercado Pago order under the method of a refund that carries one", async () => {
  const screen = await render(
    <ColumnsTable
      refunds={[{ ...transferRefund, method: "POINT", provider_order_id: "ORD01X" }]}
    />,
  );

  await expect.poll(() => rowTexts(screen)).toHaveLength(1);
  expect(rowTexts(screen)[0]).toContain("Point integradaOrden ORD01X");
});

test("tells the delivery state of a refund the cloud sends, before its Mercado Pago order", async () => {
  const screen = await render(
    <ColumnsTable
      refunds={[unconfirmedCloudRefund, { ...latePaymentRefund, provider_order_id: "ORD01Y" }]}
    />,
  );

  await expect.poll(() => rowTexts(screen)).toHaveLength(2);
  const rows = rowTexts(screen);
  expect(rows[0]).toContain("QR de Mercado PagoSin confirmar");
  expect(rows[1]).toContain("QR de Mercado PagoSin confirmar · Orden ORD01Y");
});

const OPTIONS: FilterOptions = [
  { value: "all", label: "Todas" },
  { value: "front", label: "Caja del frente" },
];

test("shows the choice the address carries when it is offered", async () => {
  const { result } = await renderHook(() =>
    useOfferedChoice({ chosen: "front", options: OPTIONS, settled: true }),
  );

  expect(result.current.choice).toBe("front");
  expect(result.current.shown).toBe("front");
});

test("shows the first option, keeping the choice, while the list that would offer the choice has not settled", async () => {
  const { result } = await renderHook(() =>
    useOfferedChoice({ chosen: "back", options: OPTIONS, settled: false }),
  );

  expect(result.current.shown).toBe("all");
  expect(result.current.choice).toBe("back");
});

test("falls back to the first option once the list settles without offering the choice", async () => {
  const { result } = await renderHook(() =>
    useOfferedChoice({ chosen: "back", options: OPTIONS, settled: true }),
  );

  await expect.poll(() => result.current.choice).toBe("all");
  expect(result.current.shown).toBe("all");
});

test("takes a new choice", async () => {
  const { result, act } = await renderHook(() =>
    useOfferedChoice({ chosen: "all", options: OPTIONS, settled: true }),
  );

  await act(() => result.current.setChoice("front"));

  expect(result.current.choice).toBe("front");
  expect(result.current.shown).toBe("front");
});

test("reports nothing while the chosen filters equal the current ones", async () => {
  const onFiltersChange = vi.fn();

  await renderHook(() =>
    useReportedFilters({ register: "all" }, { register: "all" }, onFiltersChange),
  );

  expect(onFiltersChange).not.toHaveBeenCalled();
});

test("reports the chosen filters when they differ from the current ones", async () => {
  const onFiltersChange = vi.fn();

  await renderHook(() =>
    useReportedFilters({ register: "front" }, { register: "all" }, onFiltersChange),
  );

  await expect.poll(() => onFiltersChange.mock.calls).toEqual([[{ register: "front" }]]);
});
