import { PackageSearch, Pencil } from "lucide-react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../test/axe";
import { Table } from "./table";
import { actionsColumn, dataColumn } from "./table-columns";
import type { TableProps } from "./table-types";
import { useTableModel } from "./use-table-model";

type Product = { id: string; name: string; stock: string };

const coffee: Product = { id: "1", name: "Coffee", stock: "12" };
const tea: Product = { id: "2", name: "Tea", stock: "8" };

const columns = [
  dataColumn({ id: "name", header: "Producto", render: (p: Product) => p.name }),
  dataColumn({ id: "stock", header: "Stock", render: (p: Product) => p.stock }),
  actionsColumn({
    id: "actions",
    header: "Acciones",
    actions: [
      (p: Product) => ({ icon: <Pencil />, "aria-label": `Editar ${p.name}`, onPress: () => {} }),
    ],
    menu: (p: Product) => [{ label: `Duplicar ${p.name}`, onAction: () => {} }],
  }),
] as const;

function PressableTable({
  items = [coffee, tea],
  ...props
}: Omit<TableProps<Product>, "table" | "aria-label"> & { items?: readonly Product[] }) {
  const table = useTableModel({
    items,
    id: (item) => item.id,
    columns,
    sort: { column: "", direction: "ascending" },
    onSortChange: () => {},
  });
  return <Table table={table} aria-label="Productos" {...props} />;
}

test("calls onRowPress with the item when a cell of its row is clicked", async () => {
  const onRowPress = vi.fn();
  const screen = await render(<PressableTable onRowPress={onRowPress} />);

  await userEvent.click(screen.getByRole("cell", { name: "8" }));

  expect(onRowPress).toHaveBeenCalledExactlyOnceWith(tea);
});

test("does not call onRowPress when the click starts on a button of the row", async () => {
  const onRowPress = vi.fn();
  const screen = await render(<PressableTable onRowPress={onRowPress} />);

  await userEvent.click(screen.getByRole("button", { name: "Editar Coffee" }));

  expect(onRowPress).not.toHaveBeenCalled();
});

test("does not call onRowPress when the click opens the row's Más acciones menu", async () => {
  const onRowPress = vi.fn();
  const screen = await render(<PressableTable onRowPress={onRowPress} />);

  await userEvent.click(screen.getByRole("button", { name: "Más acciones" }).nth(0));

  await expect.element(screen.getByRole("menuitem", { name: "Duplicar Coffee" })).toBeVisible();
  expect(onRowPress).not.toHaveBeenCalled();
});

const ignoringColumns = [
  dataColumn({
    id: "name",
    header: "Producto",
    render: (p: Product) => (
      <span data-row-press-ignore>
        <span>{`Nota ${p.name}`}</span>
      </span>
    ),
  }),
] as const;

function IgnoringTable({ onRowPress }: { onRowPress: (item: Product) => void }) {
  const table = useTableModel({
    items: [coffee],
    id: (item) => item.id,
    columns: ignoringColumns,
    sort: { column: "", direction: "ascending" },
    onSortChange: () => {},
  });
  return <Table table={table} aria-label="Productos" onRowPress={onRowPress} />;
}

test("does not call onRowPress for a click inside an element marked data-row-press-ignore", async () => {
  const onRowPress = vi.fn();
  const screen = await render(<IgnoringTable onRowPress={onRowPress} />);

  await userEvent.click(screen.getByText("Nota Coffee"));

  expect(onRowPress).not.toHaveBeenCalled();
});

test("gives data rows a pointer cursor only when onRowPress is set", async () => {
  const withPress = await render(<PressableTable onRowPress={() => {}} />);
  const pressableRow = withPress.getByRole("cell", { name: "Coffee" }).element().closest("tr");
  expect(getComputedStyle(pressableRow as HTMLElement).cursor).toBe("pointer");
  await withPress.unmount();

  const withoutPress = await render(<PressableTable />);
  const plainRow = withoutPress.getByRole("cell", { name: "Coffee" }).element().closest("tr");
  expect(getComputedStyle(plainRow as HTMLElement).cursor).not.toBe("pointer");
  expect((plainRow as HTMLElement).className).not.toContain("cursor-pointer");
});

test("does nothing when a row is clicked and onRowPress is not set", async () => {
  const screen = await render(<PressableTable />);

  await userEvent.click(screen.getByRole("cell", { name: "Coffee" }));

  expect(screen.getByRole("cell", { name: "Coffee" }).element()).toBeInTheDocument();
});

test("never calls onRowPress from the placeholder rows while loading is initial", async () => {
  const onRowPress = vi.fn();
  const screen = await render(<PressableTable onRowPress={onRowPress} loading="initial" />);

  const placeholderRows = Array.from(screen.container.querySelectorAll("tbody tr"));
  expect(placeholderRows.length).toBeGreaterThan(0);
  for (const row of placeholderRows) {
    (row as HTMLElement).click();
    for (const cell of Array.from(row.querySelectorAll("td"))) {
      cell.click();
    }
  }

  expect(onRowPress).not.toHaveBeenCalled();
});

test("never calls onRowPress from the empty state row", async () => {
  const onRowPress = vi.fn();
  const screen = await render(
    <PressableTable
      onRowPress={onRowPress}
      empty={{ icon: <PackageSearch />, title: "Sin productos", variant: "blank" }}
      items={[]}
    />,
  );
  const row = screen.container.querySelector("tbody tr") as HTMLElement;
  (row.querySelector("td") as HTMLElement).click();

  expect(onRowPress).not.toHaveBeenCalled();
});

test("marks the selected row as the current one when onRowPress is set", async () => {
  const screen = await render(
    <PressableTable
      onRowPress={() => {}}
      rowState={(item) => (item.id === "2" ? "selected" : undefined)}
    />,
  );

  const rows = Array.from(screen.container.querySelectorAll("tbody tr"));
  expect(rows.map((row) => row.getAttribute("aria-current"))).toEqual([null, "true"]);
});

test("leaves the selected row without aria-current when onRowPress is not set", async () => {
  const screen = await render(
    <PressableTable rowState={(item) => (item.id === "2" ? "selected" : undefined)} />,
  );

  expect(screen.container.querySelector("[aria-current]")).toBeNull();
});

test("has no accessibility violations with pressable rows and a selected row", async () => {
  const screen = await render(
    <PressableTable
      onRowPress={() => {}}
      rowState={(item) => (item.id === "1" ? "selected" : undefined)}
    />,
  );

  await expectNoAccessibilityViolations(screen.container);
});
