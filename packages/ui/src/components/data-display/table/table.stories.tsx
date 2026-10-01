import type { Meta, StoryObj } from "@storybook/react-vite";
import { CircleAlert, Package, Pencil, SearchX, Trash2 } from "lucide-react";
import { expect, within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../../../test-support/story-interactions";
import { Button } from "../../forms/button";
import { Table } from "./table";
import { actionsColumn, dataColumn } from "./table-columns";
import type { TableColumn, TableProps, TableSort } from "./table-types";
import { useTableModel } from "./use-table-model";

type Product = { id: string; name: string; sku: string; stock: string };

const products: Product[] = [
  { id: "1", name: "Café en grano", sku: "SKU-001", stock: "12" },
  { id: "2", name: "Té negro", sku: "SKU-002", stock: "8" },
  { id: "3", name: "Miel de abeja", sku: "SKU-003", stock: "0" },
];

const noProducts: Product[] = [];

// Every product ties, so the rows stay as the story lists them whichever way the header sorts.
const unchangedOrder = () => 0;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function ProductsTable({
  columns,
  items = products,
  sort,
  onSortChange,
  ...tableProps
}: DistributiveOmit<TableProps<Product>, "table"> & {
  columns: readonly TableColumn<Product>[];
  items?: readonly Product[];
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
}) {
  const table = useTableModel({
    items,
    id: (item) => item.id,
    columns,
    sort: sort ?? { column: "none", direction: "ascending" },
    onSortChange: onSortChange ?? (() => {}),
  });
  return <Table table={table} {...tableProps} />;
}

const baseColumns = [
  dataColumn({
    id: "name",
    header: "Producto",
    sort: { order: unchangedOrder, firstDirection: "ascending" },
    render: (item: Product) => item.name,
  }),
  dataColumn({ id: "stock", header: "Stock", align: "end", render: (item: Product) => item.stock }),
] as const;

function sortableHeader(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("button", { name: "Producto" });
}

const sort = { column: "name", direction: "ascending" } as const;
const onSortChange = () => {};

const meta: Meta<typeof Table> = {
  title: "Components/Table",
  component: Table,
};

export default meta;

type Story = StoryObj<typeof Table>;

export const Default: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={baseColumns}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

export const SortedDescending: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={baseColumns}
      sort={{ column: "name", direction: "descending" }}
      onSortChange={onSortChange}
    />
  ),
};

const twoSortableColumns = [
  baseColumns[0],
  dataColumn({
    id: "stock",
    header: "Stock",
    align: "end",
    sort: { order: unchangedOrder, firstDirection: "descending" },
    render: (item: Product) => item.stock,
  }),
] as const;

export const UnsortedSortableColumn: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={twoSortableColumns}
      sort={{ column: "stock", direction: "descending" }}
      onSortChange={onSortChange}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("columnheader", { name: "Producto" })).toHaveAttribute(
      "aria-sort",
      "none",
    );
    await expect(canvas.getByRole("columnheader", { name: "Stock" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  },
};

export const SortableHeaderHovered: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={baseColumns}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
  play: playHoverSetsDataHovered(sortableHeader),
};

export const SortableHeaderFocusVisible: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={baseColumns}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
  play: playTabReachesFocusVisible(sortableHeader),
};

export const RowSelected: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={baseColumns}
      items={[products[0] as Product, products[1] as Product]}
      rowState={(item) => (item.id === "1" ? "selected" : undefined)}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

export const RowWarning: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={baseColumns}
      items={[products[0] as Product]}
      rowState={() => "warning"}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

export const RowError: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={baseColumns}
      items={[products[0] as Product]}
      rowState={() => "error"}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

export const RowMuted: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={baseColumns}
      items={[products[2] as Product]}
      rowState={() => "muted"}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

const oneActionColumns = [
  ...baseColumns,
  actionsColumn({
    id: "actions",
    header: "Acciones",
    actions: [
      (item: Product) => ({
        icon: <Pencil />,
        "aria-label": `Editar ${item.name}`,
        onPress: () => {},
      }),
    ],
  }),
] as const;

export const WithOneAction: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={oneActionColumns}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

const twoActionColumns = [
  ...baseColumns,
  actionsColumn({
    id: "actions",
    header: "Acciones",
    actions: [
      (item: Product) => ({
        icon: <Pencil />,
        "aria-label": `Editar ${item.name}`,
        onPress: () => {},
      }),
      (item: Product) => ({
        icon: <Trash2 />,
        "aria-label": `Eliminar ${item.name}`,
        onPress: () => {},
      }),
    ],
  }),
] as const;

export const WithTwoActions: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={twoActionColumns}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

const detailColumns = [
  dataColumn({
    id: "name",
    header: "Producto",
    render: (item: Product) => (
      <span className="flex flex-col gap-1">
        <span className="text-body">{item.name}</span>
        <span className="text-detail text-text-subtle">{item.sku}</span>
      </span>
    ),
  }),
  dataColumn({ id: "stock", header: "Stock", align: "end", render: (item: Product) => item.stock }),
] as const;

export const WithCellDetail: Story = {
  render: () => <ProductsTable aria-label="Productos" columns={detailColumns} />,
};

export const LoadingInitial: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={baseColumns}
      items={noProducts}
      loading="initial"
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

export const LoadingUpdating: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={baseColumns}
      loading="updating"
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

export const EmptyBlank: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={baseColumns}
      items={noProducts}
      sort={sort}
      onSortChange={onSortChange}
      empty={{
        icon: <Package />,
        title: "Todavía no hay productos",
        description: "Los productos que cargues van a aparecer acá.",
        variant: "blank",
        actions: <Button>Cargar producto</Button>,
      }}
    />
  ),
};

export const EmptyFiltered: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={baseColumns}
      items={noProducts}
      sort={sort}
      onSortChange={onSortChange}
      empty={{
        icon: <SearchX />,
        title: "Sin resultados",
        description: "Probá con otro término de búsqueda.",
        variant: "filtered",
      }}
    />
  ),
};

export const LoadFailed: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={baseColumns}
      items={noProducts}
      sort={sort}
      onSortChange={onSortChange}
      failure={{
        icon: <CircleAlert />,
        title: "No pudimos abrir los productos",
        description: "Probá de nuevo en unos minutos.",
        onRetry: () => {},
      }}
    />
  ),
};

export const WithFooter: Story = {
  render: () => (
    <ProductsTable
      aria-label="Productos"
      columns={baseColumns}
      sort={sort}
      onSortChange={onSortChange}
      footer={<p className="p-4 text-detail text-text-subtle">3 productos</p>}
    />
  ),
};
