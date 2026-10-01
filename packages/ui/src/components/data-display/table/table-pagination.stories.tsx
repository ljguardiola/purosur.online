import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { dataColumn } from "./table-columns";
import { TablePagination } from "./table-pagination";
import { useTableModel } from "./use-table-model";

type Item = { id: string };

const columns = [dataColumn({ id: "id", header: "Id", render: (item: Item) => item.id })] as const;

const items: Item[] = Array.from({ length: 60 }, (_, index) => ({ id: String(index + 1) }));

function PagedPagination({ initialPage }: { initialPage: number }) {
  const [page, setPage] = useState(initialPage);
  const table = useTableModel({
    items,
    id: (item) => item.id,
    columns,
    paging: { page, onPageChange: setPage },
  });
  return <TablePagination table={table} label="Páginas de elementos" />;
}

const meta: Meta<typeof TablePagination> = {
  title: "Components/TablePagination",
  component: TablePagination,
};

export default meta;

type Story = StoryObj<typeof TablePagination>;

export const MiddlePage: Story = {
  render: () => <PagedPagination initialPage={2} />,
};

export const PagePastTheLast: Story = {
  render: () => <PagedPagination initialPage={9} />,
};
