import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { dataColumn } from "./table-columns";
import { TablePagination } from "./table-pagination";
import { useTableModel } from "./use-table-model";

type Product = { id: string };

const columns = [
  dataColumn({ id: "id", header: "Id", render: (item: Product) => item.id }),
] as const;

const products = (count: number): Product[] =>
  Array.from({ length: count }, (_, index) => ({ id: String(index + 1) }));

function PagedPagination({
  count,
  page: shownPage,
  onPageChange,
}: {
  count: number;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const table = useTableModel({
    items: products(count),
    id: (item) => item.id,
    columns,
    paging: { page: shownPage, onPageChange },
  });
  return <TablePagination table={table} label="Páginas de productos" />;
}

test("marks the page the table is on as the current one", async () => {
  await render(<PagedPagination count={60} page={2} onPageChange={() => {}} />);

  await expect
    .element(page.getByRole("button", { name: "Página 2" }))
    .toHaveAttribute("aria-current", "page");
});

test("marks the last page as the current one when the requested page is past it", async () => {
  await render(<PagedPagination count={60} page={9} onPageChange={() => {}} />);

  await expect
    .element(page.getByRole("button", { name: "Página 3" }))
    .toHaveAttribute("aria-current", "page");
});

test("offers one page button per page the rows make", async () => {
  await render(<PagedPagination count={60} page={1} onPageChange={() => {}} />);

  await expect.element(page.getByRole("button", { name: "Página 3" })).toBeVisible();
  await expect.element(page.getByRole("button", { name: "Página 4" })).not.toBeInTheDocument();
});

test("asks the screen for the page that is chosen", async () => {
  const onPageChange = vi.fn();
  await render(<PagedPagination count={60} page={1} onPageChange={onPageChange} />);

  await userEvent.click(page.getByRole("button", { name: "Página 3" }));

  expect(onPageChange).toHaveBeenCalledExactlyOnceWith(3);
});

test("renders nothing when every row fits in one page, or there are none", async () => {
  const { container } = await render(
    <PagedPagination count={0} page={1} onPageChange={() => {}} />,
  );

  expect(container.querySelector("nav")).toBeNull();
});
