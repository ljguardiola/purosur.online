import type { Meta, StoryObj } from "@storybook/react-vite";
import { Package, Pencil, SearchX, Trash2 } from "lucide-react";
import { within } from "storybook/test";
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
    sortable: true as const,
    defaultDirection: "ascending" as const,
    render: (item: Product) => item.name,
  },
  { key: "stock", title: "Stock", align: "end" as const, render: (item: Product) => item.stock },
] as const;

function sortableHeader(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("button", { name: "Producto" });
}

const meta: Meta<typeof Table> = {
  title: "Components/Table",
  component: Table,
  args: {
    "aria-label": "Productos",
  },
};

export default meta;

type Story = StoryObj<typeof Table>;

export const Default: Story = {
  args: { columns: baseColumns, rows: products },
};

export const Sorted: Story = {
  args: {
    columns: baseColumns,
    rows: products,
    sort: { column: "name", direction: "ascending" },
    onSortChange: () => {},
  },
};

export const SortableHeaderHovered: Story = {
  args: {
    columns: baseColumns,
    rows: products,
    sort: { column: "name", direction: "ascending" },
    onSortChange: () => {},
  },
  play: playHoverSetsDataHovered(sortableHeader),
};

export const SortableHeaderFocusVisible: Story = {
  args: {
    columns: baseColumns,
    rows: products,
    sort: { column: "name", direction: "ascending" },
    onSortChange: () => {},
  },
  play: playTabReachesFocusVisible(sortableHeader),
};

export const RowSelected: Story = {
  args: {
    columns: baseColumns,
    rows: [
      { id: "1", item: products[0]?.item as Product, state: "selected" },
      products[1] as TableRow<Product>,
    ],
  },
};

export const RowWarning: Story = {
  args: {
    columns: baseColumns,
    rows: [{ id: "1", item: products[0]?.item as Product, state: "warning" }],
  },
};

export const RowError: Story = {
  args: {
    columns: baseColumns,
    rows: [{ id: "1", item: products[0]?.item as Product, state: "error" }],
  },
};

export const RowMuted: Story = {
  args: {
    columns: baseColumns,
    rows: [{ id: "3", item: products[2]?.item as Product, state: "muted" }],
  },
};

const oneActionColumns = [
  ...baseColumns,
  {
    key: "actions",
    kind: "actions" as const,
    srLabel: "Acciones",
    actions: [
      (item: Product) => ({ icon: <Pencil />, "aria-label": `Editar ${item.name}`, onPress: () => {} }),
    ] as const,
  },
] as const;

export const WithOneAction: Story = {
  args: { columns: oneActionColumns, rows: products },
};

const twoActionColumns = [
  ...baseColumns,
  {
    key: "actions",
    kind: "actions" as const,
    srLabel: "Acciones",
    actions: [
      (item: Product) => ({ icon: <Pencil />, "aria-label": `Editar ${item.name}`, onPress: () => {} }),
      (item: Product) => ({
        icon: <Trash2 />,
        "aria-label": `Eliminar ${item.name}`,
        onPress: () => {},
      }),
    ] as const,
  },
] as const;

export const WithTwoActions: Story = {
  args: { columns: twoActionColumns, rows: products },
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
  { key: "stock", title: "Stock", align: "end" as const, render: (item: Product) => item.stock },
] as const;

export const WithCellDetail: Story = {
  args: { columns: detailColumns, rows: products },
};

export const LoadingInitial: Story = {
  args: { columns: baseColumns, rows: [], loading: "initial" },
};

export const LoadingUpdating: Story = {
  args: { columns: baseColumns, rows: products, loading: "updating" },
};

export const EmptyBlank: Story = {
  args: {
    columns: baseColumns,
    rows: [],
    empty: {
      icon: <Package />,
      title: "Todavía no hay productos",
      detail: "Los productos que cargues van a aparecer acá.",
      tone: "blank",
      actions: <Button>Cargar producto</Button>,
    },
  },
};

export const EmptyFiltered: Story = {
  args: {
    columns: baseColumns,
    rows: [],
    empty: {
      icon: <SearchX />,
      title: "Sin resultados",
      detail: "Probá con otro término de búsqueda.",
      tone: "filtered",
    },
  },
};

export const WithFooter: Story = {
  args: {
    columns: baseColumns,
    rows: products,
    footer: <p className="p-4 text-sm text-ink-secondary">3 productos</p>,
  },
};
