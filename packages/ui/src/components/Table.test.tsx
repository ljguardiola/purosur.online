import { PackageSearch } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import {
  Table,
  TableCellText,
  type TableColumn,
  type TableProps,
  type TableRow,
  type TableSort,
  type TableSortableColumnKey,
} from "./Table";

type Product = { id: string; name: string; sku?: string; stock: string };

// `as const` so each column's own "key" (and, further down, "sortable") stays a literal instead
// of widening to string/boolean: that literal is what Table's own columns type parameter reads.
const columns = [
  { key: "name", title: "Producto", render: (p: Product) => p.name },
  { key: "stock", title: "Stock", align: "end", render: (p: Product) => p.stock },
] as const;

const rows: TableRow<Product>[] = [
  { id: "1", item: { id: "1", name: "Coffee", stock: "12" } },
  { id: "2", item: { id: "2", name: "Tea", stock: "8" } },
];

// An inline [] doesn't carry Product the way `rows` above does, and loses it for the whole
// call's own type inference; a typed constant keeps it.
const emptyRows: TableRow<Product>[] = [];

// Spread alongside a `columns` prop of its own at each call site, so every render keeps its own
// columns literal instead of losing it through a shared helper's fixed return type.
const commonProps = { "aria-label": "Products", rows };

test("renders a white container with an 8px radius and a 1px line border", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} />);
  const container = screen.getByRole("table").element().parentElement as HTMLElement;
  const style = getComputedStyle(container);

  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.borderRadius).toBe("8px");
  expect(style.borderWidth).toBe("1px");
  expect(style.borderColor).toBe(tokenRgb("line"));
  expect(style.overflow).toBe("hidden");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders a 44px header row on a bone background with 16px padding and a 12px column gap", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} />);
  const headerRow = screen.getByRole("columnheader", { name: "Producto" }).element()
    .parentElement as HTMLElement;
  const style = getComputedStyle(headerRow);
  const rect = headerRow.getBoundingClientRect();

  expect(rect.height).toBeGreaterThan(43);
  expect(rect.height).toBeLessThan(45);
  expect(style.backgroundColor).toBe(tokenRgb("surface-bone"));
  expect(style.paddingLeft).toBe("16px");
  expect(style.paddingRight).toBe("16px");
  expect(style.columnGap).toBe("12px");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders 12px bold capital column titles", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} />);
  const title = screen.getByRole("columnheader", { name: "Producto" }).element() as HTMLElement;
  const style = getComputedStyle(title);

  expect(style.fontSize).toBe("12px");
  expect(style.fontWeight).toBe("700");
  expect(style.textTransform).toBe("uppercase");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders every row's cells with 16px padding and a 12px gap lined up with the header", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} />);
  const cell = screen.getByRole("cell", { name: "Coffee" }).element().parentElement as HTMLElement;
  const style = getComputedStyle(cell);

  expect(style.paddingLeft).toBe("16px");
  expect(style.paddingRight).toBe("16px");
  expect(style.columnGap).toBe("12px");
  expect(style.boxShadow).toContain(tokenRgb("line"));
  expect(style.boxShadow).toContain("-1px");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders a 56px row when every cell holds a single line", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} />);
  const row = screen.getByRole("cell", { name: "Coffee" }).element().parentElement as HTMLElement;
  const rect = row.getBoundingClientRect();

  expect(rect.height).toBeGreaterThan(55);
  expect(rect.height).toBeLessThan(57);

  await expectNoAccessibilityViolations(screen.container);
});

test("grows a row to 64px when a cell renders a detail line under its main text", async () => {
  const twoLineColumns = [
    {
      key: "name",
      title: "Producto",
      render: (p: Product) => <TableCellText detail={p.sku}>{p.name}</TableCellText>,
    },
  ] as const;
  const screen = await render(
    <Table
      {...commonProps}
      columns={twoLineColumns}
      rows={[{ id: "1", item: { id: "1", name: "Coffee", sku: "SKU-001", stock: "12" } }]}
    />,
  );
  const row = screen.getByRole("cell", { name: "Coffee SKU-001" }).element()
    .parentElement as HTMLElement;
  const rect = row.getBoundingClientRect();

  expect(rect.height).toBeGreaterThan(63);
  expect(rect.height).toBeLessThan(65);

  await expectNoAccessibilityViolations(screen.container);
});

test("renders a cell's detail line at 14px in secondary text, even in a muted row", async () => {
  const twoLineColumns = [
    {
      key: "name",
      title: "Producto",
      render: (p: Product) => <TableCellText detail={p.sku}>{p.name}</TableCellText>,
    },
  ] as const;
  const screen = await render(
    <Table
      {...commonProps}
      columns={twoLineColumns}
      rows={[
        {
          id: "1",
          item: { id: "1", name: "Coffee", sku: "SKU-001", stock: "12" },
          state: "muted",
        },
      ]}
    />,
  );
  const detail = screen.getByText("SKU-001", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(detail).fontSize).toBe("14px");
  expect(getComputedStyle(detail).color).toBe(tokenRgb("ink-secondary"));

  await expectNoAccessibilityViolations(screen.container);
});

test("wraps long cell text onto a second line instead of cutting it with an ellipsis", async () => {
  const longText =
    "A very long product name that does not fit on a single line of this narrow column";
  const screen = await render(
    <div style={{ width: "320px" }}>
      <Table
        {...commonProps}
        columns={columns}
        rows={[{ id: "1", item: { id: "1", name: longText, stock: "1" } }]}
      />
    </div>,
  );
  const cellText = screen.getByText(longText, { exact: true }).element() as HTMLElement;
  const style = getComputedStyle(cellText);
  const lineHeight = Number.parseFloat(style.lineHeight);

  expect(style.textOverflow).not.toBe("ellipsis");
  expect(cellText.getBoundingClientRect().height).toBeGreaterThan(lineHeight * 1.5);

  await expectNoAccessibilityViolations(screen.container);
});

test("right-aligns a numeric column in the header and the rows, with tabular digits", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} />);
  const header = screen.getByRole("columnheader", { name: "Stock" }).element() as HTMLElement;
  const cell = screen.getByRole("cell", { name: "12" }).element() as HTMLElement;

  expect(getComputedStyle(header).textAlign).toBe("right");
  expect(getComputedStyle(cell).textAlign).toBe("right");
  expect(getComputedStyle(cell).fontVariantNumeric).toContain("tabular-nums");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the selected row state with a blue message background and a 4px blue left edge", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={columns}
      rows={[{ id: "1", item: rows[0]?.item as Product, state: "selected" }]}
    />,
  );
  const row = screen.getByRole("cell", { name: "Coffee" }).element().parentElement as HTMLElement;
  const style = getComputedStyle(row);

  expect(style.backgroundColor).toBe(tokenRgb("brand-blue-message-bg"));
  expect(style.boxShadow).toContain(tokenRgb("brand-blue-ui"));
  expect(style.boxShadow).toContain("4px");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the warning row state with a warning message background", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={columns}
      rows={[{ id: "1", item: rows[0]?.item as Product, state: "warning" }]}
    />,
  );
  const row = screen.getByRole("cell", { name: "Coffee" }).element().parentElement as HTMLElement;

  expect(getComputedStyle(row).backgroundColor).toBe(tokenRgb("status-warning-message-bg"));

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the error row state with an error message background", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={columns}
      rows={[{ id: "1", item: rows[0]?.item as Product, state: "error" }]}
    />,
  );
  const row = screen.getByRole("cell", { name: "Coffee" }).element().parentElement as HTMLElement;

  expect(getComputedStyle(row).backgroundColor).toBe(tokenRgb("status-error-message-bg"));

  await expectNoAccessibilityViolations(screen.container);
});

test("renders every cell of a muted row in secondary text, with its background unchanged", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={columns}
      rows={[{ id: "1", item: rows[0]?.item as Product, state: "muted" }]}
    />,
  );
  const row = screen.getByRole("cell", { name: "Coffee" }).element().parentElement as HTMLElement;
  const cellText = screen.getByText("Coffee", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(row).backgroundColor).toBe(tokenRgb("surface-white"));
  expect(getComputedStyle(cellText).color).toBe(tokenRgb("ink-secondary"));

  await expectNoAccessibilityViolations(screen.container);
});

test("renders one action button in a 60px wide, unnamed-title actions column named for assistive technology", async () => {
  const actionColumns = [
    { key: "name", title: "Producto", render: (p: Product) => p.name },
    {
      key: "actions",
      kind: "actions",
      srLabel: "Actions",
      count: 1,
      render: () => <button type="button">Edit</button>,
    },
  ] as const;
  const screen = await render(<Table {...commonProps} columns={actionColumns} />);
  const header = screen.getByRole("columnheader", { name: "Actions" }).element() as HTMLElement;

  expect(header.textContent).toBe("Actions");
  expect(getComputedStyle(header).width).toBe("60px");
  await expect.element(screen.getByRole("button", { name: "Edit" }).nth(0)).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("widens the actions column to 104px for two action buttons", async () => {
  const actionColumns = [
    { key: "name", title: "Producto", render: (p: Product) => p.name },
    {
      key: "actions",
      kind: "actions",
      srLabel: "Actions",
      count: 2,
      render: () => (
        <>
          <button type="button">Edit</button>
          <button type="button">Delete</button>
        </>
      ),
    },
  ] as const;
  const screen = await render(<Table {...commonProps} columns={actionColumns} />);
  const header = screen.getByRole("columnheader", { name: "Actions" }).element() as HTMLElement;

  expect(getComputedStyle(header).width).toBe("104px");

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a column without a title, or an actions column without its own fields", () => {
  expectTypeOf<{ key: string; render: (item: Product) => string }>().not.toExtend<
    TableColumn<Product>
  >();
  expectTypeOf<{ key: string; kind: "actions"; render: (item: Product) => string }>().not.toExtend<
    TableColumn<Product>
  >();
});

const sortableColumns = [
  {
    key: "name",
    title: "Producto",
    sortable: true,
    defaultDirection: "ascending",
    render: (p: Product) => p.name,
  },
  {
    key: "stock",
    title: "Stock",
    align: "end",
    sortable: true,
    defaultDirection: "descending",
    render: (p: Product) => p.stock,
  },
] as const;

test("renders an unsorted sortable column with a 12px chevrons-up-down icon, both in secondary text", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "stock", direction: "descending" }}
      onSortChange={() => {}}
    />,
  );
  const header = screen.getByRole("columnheader", { name: "Producto" }).element() as HTMLElement;
  const icon = header.querySelector("svg") as SVGSVGElement;

  expect(icon).not.toBeNull();
  expect(icon.classList.contains("lucide-chevrons-up-down")).toBe(true);
  const iconRect = icon.getBoundingClientRect();
  expect(iconRect.width).toBeGreaterThan(11);
  expect(iconRect.width).toBeLessThan(13);
  expect(getComputedStyle(icon).color).toBe(tokenRgb("ink-secondary"));
  expect(header.getAttribute("aria-sort")).toBe("none");

  await expectNoAccessibilityViolations(screen.container);
});

test("sits the sort chevron 4px after the column title", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "stock", direction: "descending" }}
      onSortChange={() => {}}
    />,
  );
  const header = screen.getByRole("columnheader", { name: "Producto" }).element() as HTMLElement;
  const title = screen.getByText("Producto", { exact: true }).element() as HTMLElement;
  const icon = header.querySelector("svg") as SVGSVGElement;

  const gap = icon.getBoundingClientRect().left - title.getBoundingClientRect().right;
  expect(gap).toBeGreaterThan(3);
  expect(gap).toBeLessThan(5);

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the ascending sort with an up chevron, title and icon in ink, exposed as aria-sort", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "name", direction: "ascending" }}
      onSortChange={() => {}}
    />,
  );
  const header = screen.getByRole("columnheader", { name: "Producto" }).element() as HTMLElement;
  const title = screen.getByText("Producto", { exact: true }).element() as HTMLElement;
  const icon = header.querySelector("svg") as SVGSVGElement;

  expect(header.getAttribute("aria-sort")).toBe("ascending");
  expect(icon.classList.contains("lucide-chevron-up")).toBe(true);
  expect(getComputedStyle(title).color).toBe(tokenRgb("ink"));
  expect(getComputedStyle(icon).color).toBe(tokenRgb("ink"));

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the descending sort with a down chevron, title and icon in ink, exposed as aria-sort", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "stock", direction: "descending" }}
      onSortChange={() => {}}
    />,
  );
  const header = screen.getByRole("columnheader", { name: "Stock" }).element() as HTMLElement;
  const icon = header.querySelector("svg") as SVGSVGElement;

  expect(header.getAttribute("aria-sort")).toBe("descending");
  expect(icon.classList.contains("lucide-chevron-down")).toBe(true);

  await expectNoAccessibilityViolations(screen.container);
});

test("asks the caller to sort by a column using its own first direction, on click", async () => {
  const onSortChange = vi.fn();
  const screen = await render(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "stock", direction: "descending" }}
      onSortChange={onSortChange}
    />,
  );

  await screen.getByRole("columnheader", { name: "Producto" }).click();

  expect(onSortChange).toHaveBeenCalledWith({ column: "name", direction: "ascending" });
  await expectNoAccessibilityViolations(screen.container);
});

test("asks the caller to sort by a column using its own first direction, from the keyboard", async () => {
  const onSortChange = vi.fn();
  await render(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "name", direction: "ascending" }}
      onSortChange={onSortChange}
    />,
  );

  await userEvent.tab();
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");

  expect(onSortChange).toHaveBeenCalledWith({ column: "stock", direction: "descending" });
});

test("asks for the opposite direction when activating the column already sorted", async () => {
  const onSortChange = vi.fn();
  const screen = await render(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "name", direction: "ascending" }}
      onSortChange={onSortChange}
    />,
  );

  await screen.getByRole("columnheader", { name: "Producto" }).click();

  expect(onSortChange).toHaveBeenCalledWith({ column: "name", direction: "descending" });
});

test("does not accept a sortable column without its own first direction", () => {
  expectTypeOf<{
    key: string;
    title: string;
    sortable: true;
    render: (item: Product) => string;
  }>().not.toExtend<TableColumn<Product>>();
});

test("does not accept a sortable column without sort and onSortChange", () => {
  expectTypeOf<{
    "aria-label": string;
    columns: typeof sortableColumns;
    rows: TableRow<Product>[];
  }>().not.toExtend<TableProps<Product, typeof sortableColumns>>();
});

test("does not accept sort or onSortChange when no column is sortable", () => {
  expectTypeOf<{
    "aria-label": string;
    columns: typeof columns;
    rows: TableRow<Product>[];
    sort: TableSort;
  }>().not.toExtend<TableProps<Product, typeof columns>>();
  expectTypeOf<{
    "aria-label": string;
    columns: typeof columns;
    rows: TableRow<Product>[];
    onSortChange: (sort: TableSort) => void;
  }>().not.toExtend<TableProps<Product, typeof columns>>();
});

test("does not accept sorting by a non-sortable or unknown column key", () => {
  expectTypeOf<{
    "aria-label": string;
    columns: typeof sortableColumns;
    rows: TableRow<Product>[];
    sort: { column: "unknown-key"; direction: "ascending" };
    onSortChange: (sort: TableSort) => void;
  }>().not.toExtend<TableProps<Product, typeof sortableColumns>>();
});

test("types onSortChange's column as exactly the union of the sortable columns' own keys", () => {
  expectTypeOf<TableSortableColumnKey<Product, typeof sortableColumns>>().toEqualTypeOf<
    "name" | "stock"
  >();
});

// A columns array with an explicit, wide TableColumn<Product> annotation instead of a literal
// one (see `columns` above, declared with `as const`): the array's own type retains no info
// about which of its columns, if any, are sortable.
const wideColumns: readonly [TableColumn<Product>, ...TableColumn<Product>[]] = columns;

test("falls to the safe side for a widely annotated columns array: a required handler and string keys", () => {
  expectTypeOf<TableSortableColumnKey<Product, typeof wideColumns>>().toEqualTypeOf<string>();
  expectTypeOf<{
    "aria-label": string;
    columns: typeof wideColumns;
    rows: TableRow<Product>[];
  }>().not.toExtend<TableProps<Product, typeof wideColumns>>();
  expectTypeOf<{
    "aria-label": string;
    columns: typeof wideColumns;
    rows: TableRow<Product>[];
    sort: { column: string; direction: "ascending" };
    onSortChange: (sort: TableSort) => void;
  }>().toExtend<TableProps<Product, typeof wideColumns>>();
});

test("renders the placeholder rows immediately, hidden from assistive technology, with loading initial", async () => {
  const screen = await render(
    <Table {...commonProps} columns={columns} rows={emptyRows} loading="initial" />,
  );
  const table = screen.getByRole("table").element() as HTMLElement;

  expect(table.getAttribute("aria-busy")).toBe("true");
  const placeholderRows = screen.container.querySelectorAll('tbody[aria-hidden="true"] tr');
  expect(placeholderRows).toHaveLength(5);

  const placeholderRow = placeholderRows[0] as HTMLElement;
  expect(placeholderRow.getBoundingClientRect().height).toBeGreaterThan(55);
  expect(placeholderRow.getBoundingClientRect().height).toBeLessThan(57);

  await expect.element(screen.getByRole("columnheader", { name: "Producto" })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("reveals the placeholder rows exactly at 300ms, proven with the Web Animations API", async () => {
  const screen = await render(
    <Table {...commonProps} columns={columns} rows={emptyRows} loading="initial" />,
  );
  const placeholderRow = screen.container.querySelector(
    'tbody[aria-hidden="true"] tr',
  ) as HTMLElement;

  const [animation] = placeholderRow.getAnimations();
  if (!animation) {
    throw new Error("Expected the placeholder row to have a running CSS animation.");
  }
  animation.pause();

  animation.currentTime = 299;
  expect(getComputedStyle(placeholderRow).opacity).toBe("0");

  animation.currentTime = 300;
  expect(getComputedStyle(placeholderRow).opacity).toBe("1");
});

test("removes the placeholder rows once loading leaves initial", async () => {
  const screen = await render(
    <Table {...commonProps} columns={columns} rows={emptyRows} loading="initial" />,
  );
  await screen.rerender(<Table {...commonProps} columns={columns} loading={false} />);

  expect(screen.container.querySelectorAll('tbody[aria-hidden="true"] tr')).toHaveLength(0);
  await expect.element(screen.getByRole("cell", { name: "Coffee" })).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the current rows and shows a top loading bar while updating", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} loading="updating" />);
  const table = screen.getByRole("table").element() as HTMLElement;

  await expect.element(screen.getByRole("cell", { name: "Coffee" })).toBeVisible();
  expect(table.getAttribute("aria-busy")).toBe("true");

  const bar = screen.container.querySelector('[class*="bg-brand-blue-message-bg"]') as HTMLElement;
  expect(bar).not.toBeNull();
  expect(getComputedStyle(bar).backgroundColor).toBe(tokenRgb("brand-blue-message-bg"));

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the empty state in place of the header and rows, in blue strong when there is nothing yet", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={columns}
      rows={emptyRows}
      empty={{
        icon: <PackageSearch />,
        title: "No products yet",
        detail: "Add your first product to see it here.",
        tone: "blank",
      }}
    />,
  );

  await expect.element(screen.getByText("No products yet")).toBeVisible();
  const icon = screen.container.querySelector("svg") as SVGSVGElement;
  expect(getComputedStyle(icon).color).toBe(tokenRgb("brand-blue-strong"));
  expect(screen.container.querySelector("table")).toBeNull();

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the empty state in secondary text when nothing matches the filters, with the caller's actions", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={columns}
      rows={emptyRows}
      empty={{
        icon: <PackageSearch />,
        title: "No matches",
        detail: "Try a different filter.",
        tone: "filtered",
        actions: <button type="button">Clear filters</button>,
      }}
    />,
  );

  const icon = screen.container.querySelector("svg") as SVGSVGElement;
  expect(getComputedStyle(icon).color).toBe(tokenRgb("ink-secondary"));
  await expect.element(screen.getByRole("button", { name: "Clear filters" })).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a table without an accessible name, its columns or its rows", () => {
  expectTypeOf<{ columns: typeof columns; rows: TableRow<Product>[] }>().not.toExtend<
    TableProps<Product>
  >();
  expectTypeOf<{ "aria-label": string; rows: TableRow<Product>[] }>().not.toExtend<
    TableProps<Product>
  >();
  expectTypeOf<{ "aria-label": string; columns: typeof columns }>().not.toExtend<
    TableProps<Product>
  >();
});
