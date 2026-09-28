import type { Meta, StoryObj } from "@storybook/react-vite";
import { Package, Pencil, SearchX, Trash2 } from "lucide-react";
import { expect, within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../test-support/story-interactions";
import { Button } from "./Button";
import { Table, type TableRow } from "./Table";

type Product = { id: string; name: string; sku: string; stock: string };

const products: TableRow<Product>[] = [
  { id: "1", item: { id: "1", name: "Café en grano", sku: "SKU-001", stock: "12" } },
  { id: "2", item: { id: "2", name: "Té negro", sku: "SKU-002", stock: "8" } },
  { id: "3", item: { id: "3", name: "Miel de abeja", sku: "SKU-003", stock: "0" } },
];

const baseColumns = [
  {
    key: "name",
    title: "Producto",
    sortable: true,
    defaultDirection: "ascending",
    render: (item: Product) => item.name,
  },
  { key: "stock", title: "Stock", align: "end", render: (item: Product) => item.stock },
] as const;

function sortableHeader(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("button", { name: "Producto" });
}

const sort = { column: "name", direction: "ascending" } as const;
const onSortChange = () => {};
const emptyRows: TableRow<Product>[] = [];

const meta: Meta<typeof Table> = {
  title: "Components/Table",
  component: Table,
};

export default meta;

type Story = StoryObj<typeof Table>;

export const Default: Story = {
  render: () => (
    <Table
      aria-label="Productos"
      columns={baseColumns}
      rows={products}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

export const SortedDescending: Story = {
  render: () => (
    <Table
      aria-label="Productos"
      columns={baseColumns}
      rows={products}
      sort={{ column: "name", direction: "descending" }}
      onSortChange={onSortChange}
    />
  ),
};

const twoSortableColumns = [
  baseColumns[0],
  {
    key: "stock",
    title: "Stock",
    align: "end",
    sortable: true,
    defaultDirection: "descending",
    render: (item: Product) => item.stock,
  },
] as const;

export const UnsortedSortableColumn: Story = {
  render: () => (
    <Table
      aria-label="Productos"
      columns={twoSortableColumns}
      rows={products}
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
    <Table
      aria-label="Productos"
      columns={baseColumns}
      rows={products}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
  play: playHoverSetsDataHovered(sortableHeader),
};

export const SortableHeaderFocusVisible: Story = {
  render: () => (
    <Table
      aria-label="Productos"
      columns={baseColumns}
      rows={products}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
  play: playTabReachesFocusVisible(sortableHeader),
};

export const RowSelected: Story = {
  render: () => (
    <Table
      aria-label="Productos"
      columns={baseColumns}
      rows={[
        { id: "1", item: products[0]?.item as Product, state: "selected" },
        products[1] as TableRow<Product>,
      ]}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

export const RowWarning: Story = {
  render: () => (
    <Table
      aria-label="Productos"
      columns={baseColumns}
      rows={[{ id: "1", item: products[0]?.item as Product, state: "warning" }]}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

export const RowError: Story = {
  render: () => (
    <Table
      aria-label="Productos"
      columns={baseColumns}
      rows={[{ id: "1", item: products[0]?.item as Product, state: "error" }]}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

export const RowMuted: Story = {
  render: () => (
    <Table
      aria-label="Productos"
      columns={baseColumns}
      rows={[{ id: "3", item: products[2]?.item as Product, state: "muted" }]}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

const oneActionColumns = [
  ...baseColumns,
  {
    key: "actions",
    kind: "actions",
    srLabel: "Acciones",
    actions: [
      (item: Product) => ({
        icon: <Pencil />,
        "aria-label": `Editar ${item.name}`,
        onPress: () => {},
      }),
    ],
  },
] as const;

export const WithOneAction: Story = {
  render: () => (
    <Table
      aria-label="Productos"
      columns={oneActionColumns}
      rows={products}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

const twoActionColumns = [
  ...baseColumns,
  {
    key: "actions",
    kind: "actions",
    srLabel: "Acciones",
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
  },
] as const;

export const WithTwoActions: Story = {
  render: () => (
    <Table
      aria-label="Productos"
      columns={twoActionColumns}
      rows={products}
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

const detailColumns = [
  {
    key: "name",
    title: "Producto",
    render: (item: Product) => (
      <span className="flex flex-col gap-1">
        <span className="text-base leading-[24px]">{item.name}</span>
        <span className="text-sm leading-[20px] text-ink-secondary">{item.sku}</span>
      </span>
    ),
  },
  { key: "stock", title: "Stock", align: "end", render: (item: Product) => item.stock },
] as const;

export const WithCellDetail: Story = {
  render: () => <Table aria-label="Productos" columns={detailColumns} rows={products} />,
};

export const LoadingInitial: Story = {
  render: () => (
    <Table
      aria-label="Productos"
      columns={baseColumns}
      rows={emptyRows}
      loading="initial"
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

export const LoadingUpdating: Story = {
  render: () => (
    <Table
      aria-label="Productos"
      columns={baseColumns}
      rows={products}
      loading="updating"
      sort={sort}
      onSortChange={onSortChange}
    />
  ),
};

export const EmptyBlank: Story = {
  render: () => (
    <Table
      aria-label="Productos"
      columns={baseColumns}
      rows={emptyRows}
      sort={sort}
      onSortChange={onSortChange}
      empty={{
        icon: <Package />,
        title: "Todavía no hay productos",
        detail: "Los productos que cargues van a aparecer acá.",
        tone: "blank",
        actions: <Button>Cargar producto</Button>,
      }}
    />
  ),
};

export const EmptyFiltered: Story = {
  render: () => (
    <Table
      aria-label="Productos"
      columns={baseColumns}
      rows={emptyRows}
      sort={sort}
      onSortChange={onSortChange}
      empty={{
        icon: <SearchX />,
        title: "Sin resultados",
        detail: "Probá con otro término de búsqueda.",
        tone: "filtered",
      }}
    />
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Table
      aria-label="Productos"
      columns={baseColumns}
      rows={products}
      sort={sort}
      onSortChange={onSortChange}
      footer={<p className="p-4 text-sm text-ink-secondary">3 productos</p>}
    />
  ),
};
