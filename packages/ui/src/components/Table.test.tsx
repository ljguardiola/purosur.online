import { PackageSearch, Pencil, Trash2 } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import { IconButton } from "./IconButton";
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

// getComputedStyle's own box-shadow always reports every Tailwind shadow/ring layer, including
// the unused ones (transparent, zero-sized), so a border painted with an inset shadow has to be
// found among several layers rather than compared as one whole string. Splits on a top-level
// comma only (not one nested inside an rgb()/rgba() color).
function shadowLayers(boxShadow: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of boxShadow) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      layers.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  layers.push(current.trim());
  return layers;
}

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

test("builds the table from real table/thead/tbody/tr/th/td tags instead of styled divs, so every table role comes from the tag itself in every engine", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} />);
  const table = screen.getByRole("table").element() as HTMLElement;
  const thead = table.querySelector("thead") as HTMLElement;
  const tbody = table.querySelector("tbody") as HTMLElement;
  const headerRow = thead.querySelector("tr") as HTMLElement;
  const headerCell = thead.querySelector("th") as HTMLElement;
  const bodyRow = tbody.querySelector("tr") as HTMLElement;
  const bodyCell = tbody.querySelector("td") as HTMLElement;

  expect(table.tagName).toBe("TABLE");
  expect(thead.tagName).toBe("THEAD");
  expect(tbody.tagName).toBe("TBODY");
  expect(headerRow.tagName).toBe("TR");
  expect(headerCell.tagName).toBe("TH");
  expect(bodyRow.tagName).toBe("TR");
  expect(bodyCell.tagName).toBe("TD");
  // None of these override the CSS display their own tag already implies (no "flex"/"block" on
  // any of them), which is what keeps their implicit ARIA role intact in every engine.
  expect(getComputedStyle(table).display).toBe("table");
  expect(getComputedStyle(thead).display).toBe("table-header-group");
  expect(getComputedStyle(tbody).display).toBe("table-row-group");
  expect(getComputedStyle(headerRow).display).toBe("table-row");
  expect(getComputedStyle(headerCell).display).toBe("table-cell");
  expect(getComputedStyle(bodyRow).display).toBe("table-row");
  expect(getComputedStyle(bodyCell).display).toBe("table-cell");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders a 44px header row on a bone background with 16px edge padding and a 12px gap between columns", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} />);
  const firstCell = screen.getByRole("columnheader", { name: "Producto" }).element() as HTMLElement;
  const lastCell = screen.getByRole("columnheader", { name: "Stock" }).element() as HTMLElement;
  const headerRow = firstCell.parentElement as HTMLElement;
  const rowStyle = getComputedStyle(headerRow);
  const rect = headerRow.getBoundingClientRect();
  const firstStyle = getComputedStyle(firstCell);
  const lastStyle = getComputedStyle(lastCell);

  expect(rect.height).toBeGreaterThan(43);
  expect(rect.height).toBeLessThan(45);
  expect(rowStyle.backgroundColor).toBe(tokenRgb("surface-bone"));
  // The row's own left/right edge: the first column's own left padding, the last column's own
  // right padding.
  expect(firstStyle.paddingLeft).toBe("16px");
  expect(lastStyle.paddingRight).toBe("16px");
  // The 12px gap between the two columns: each side of that shared boundary owns half of it.
  expect(firstStyle.paddingRight).toBe("6px");
  expect(lastStyle.paddingLeft).toBe("6px");

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

test("renders every row's cells with 16px edge padding and a 12px gap lined up with the header, over a 1px line bottom border", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} />);
  const firstCell = screen.getByRole("cell", { name: "Coffee" }).element() as HTMLElement;
  const lastCell = screen.getByRole("cell", { name: "12" }).element() as HTMLElement;
  const row = firstCell.parentElement as HTMLElement;
  const firstStyle = getComputedStyle(firstCell);
  const lastStyle = getComputedStyle(lastCell);
  const rowStyle = getComputedStyle(row);

  expect(firstStyle.paddingLeft).toBe("16px");
  expect(lastStyle.paddingRight).toBe("16px");
  expect(firstStyle.paddingRight).toBe("6px");
  expect(lastStyle.paddingLeft).toBe("6px");
  const layers = shadowLayers(rowStyle.boxShadow);
  expect(layers[layers.length - 1]).toBe(`${tokenRgb("line")} 0px -1px 0px 0px inset`);

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

test("grows a row to fit a taller cell, like one holding a form control, beyond the 56px floor", async () => {
  const tallColumns = [
    {
      key: "name",
      title: "Producto",
      render: () => <div style={{ height: "48px" }}>Control</div>,
    },
  ] as const;
  const screen = await render(
    <Table
      {...commonProps}
      columns={tallColumns}
      rows={[{ id: "1", item: { id: "1", name: "Coffee", stock: "12" } }]}
    />,
  );
  const row = screen.getByText("Control").element().closest("tr") as HTMLElement;
  const rect = row.getBoundingClientRect();

  // 48px control plus the cell's own 8px top and bottom padding, past the 56px (h-14) floor.
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

test("renders a falsy-but-present detail, like 0, as a real detail line rather than a stray value", async () => {
  const screen = await render(<TableCellText detail={0}>Coffee</TableCellText>);
  const detail = screen.getByText("0", { exact: true }).element() as HTMLElement;

  expect(detail.tagName).toBe("SPAN");
  expect(getComputedStyle(detail).fontSize).toBe("14px");
  expect(getComputedStyle(detail).color).toBe(tokenRgb("ink-secondary"));

  await expectNoAccessibilityViolations(screen.container);
});

test("stacks its own text and detail line with a 4px gap and their own 24px/20px line heights", async () => {
  const screen = await render(<TableCellText detail="SKU-001">Coffee</TableCellText>);
  const container = screen.getByText("Coffee").element().parentElement as HTMLElement;
  const text = screen.getByText("Coffee", { exact: true }).element() as HTMLElement;
  const detail = screen.getByText("SKU-001", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(container).display).toBe("flex");
  expect(getComputedStyle(container).flexDirection).toBe("column");
  expect(getComputedStyle(container).rowGap).toBe("4px");
  expect(getComputedStyle(text).lineHeight).toBe("24px");
  expect(getComputedStyle(detail).lineHeight).toBe("20px");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders no detail line when no detail is given", async () => {
  const screen = await render(<TableCellText>Coffee</TableCellText>);

  expect(screen.container.querySelectorAll("span")).toHaveLength(1);

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

test("breaks a long unbreakable token inside its own cell instead of overrunning the next column", async () => {
  const barcode = "1234567890123456789012345678901234567890";
  const screen = await render(
    <div style={{ width: "320px" }}>
      <Table
        {...commonProps}
        columns={columns}
        rows={[{ id: "1", item: { id: "1", name: barcode, stock: "1" } }]}
      />
    </div>,
  );
  const cellText = screen.getByText(barcode, { exact: true }).element() as HTMLElement;
  const cell = cellText.closest("td") as HTMLElement;

  expect(getComputedStyle(cell).overflowWrap).toBe("break-word");
  expect(cellText.getBoundingClientRect().width).toBeLessThanOrEqual(
    cell.getBoundingClientRect().width,
  );

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
  const layers = shadowLayers(style.boxShadow);
  expect(layers[layers.length - 2]).toBe(`${tokenRgb("line")} 0px -1px 0px 0px inset`);
  expect(layers[layers.length - 1]).toBe(`${tokenRgb("brand-blue-ui")} 4px 0px 0px 0px inset`);

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

test("renders one IconButton at its own 38x38px in an 82px wide, unnamed-title actions column named for assistive technology", async () => {
  const actionColumns = [
    { key: "name", title: "Producto", render: (p: Product) => p.name },
    {
      key: "actions",
      kind: "actions",
      srLabel: "Actions",
      count: 1,
      render: () => <IconButton aria-label="Edit" icon={<Pencil />} />,
    },
  ] as const;
  const screen = await render(<Table {...commonProps} columns={actionColumns} />);
  const header = screen.getByRole("columnheader", { name: "Actions" }).element() as HTMLElement;

  expect(header.textContent).toBe("Actions");
  // 60px design content width + 6px inner padding (not first) + 16px edge padding (last).
  expect(getComputedStyle(header).width).toBe("82px");
  const edit = screen.getByRole("button", { name: "Edit" }).nth(0);
  await expect.element(edit).toBeVisible();
  const editRect = edit.element().getBoundingClientRect();

  expect(editRect.width).toBeGreaterThan(37);
  expect(editRect.width).toBeLessThan(39);
  expect(editRect.height).toBeGreaterThan(37);
  expect(editRect.height).toBeLessThan(39);

  const row = edit.element().closest("tr") as HTMLElement;
  const rowHeight = row.getBoundingClientRect().height;
  expect(rowHeight).toBeGreaterThan(55);
  expect(rowHeight).toBeLessThan(57);

  await expectNoAccessibilityViolations(screen.container);
});

test("renders two IconButtons at their own 38x38px with an 8px gap, right-aligned, in a 126px actions column", async () => {
  const actionColumns = [
    { key: "name", title: "Producto", render: (p: Product) => p.name },
    {
      key: "actions",
      kind: "actions",
      srLabel: "Actions",
      count: 2,
      render: () => (
        <>
          <IconButton aria-label="Edit" icon={<Pencil />} />
          <IconButton aria-label="Delete" icon={<Trash2 />} />
        </>
      ),
    },
  ] as const;
  const screen = await render(<Table {...commonProps} columns={actionColumns} />);
  const header = screen.getByRole("columnheader", { name: "Actions" }).element() as HTMLElement;

  // 104px design content width + 6px inner padding (not first) + 16px edge padding (last).
  expect(getComputedStyle(header).width).toBe("126px");

  const edit = screen.getByRole("button", { name: "Edit" }).nth(0).element() as HTMLElement;
  const del = screen.getByRole("button", { name: "Delete" }).nth(0).element() as HTMLElement;
  const editRect = edit.getBoundingClientRect();
  const delRect = del.getBoundingClientRect();

  expect(editRect.width).toBeGreaterThan(37);
  expect(editRect.width).toBeLessThan(39);
  expect(delRect.width).toBeGreaterThan(37);
  expect(delRect.width).toBeLessThan(39);
  expect(delRect.top).toBeCloseTo(editRect.top, 0);
  expect(delRect.left).toBeGreaterThan(editRect.left);
  expect(delRect.left - editRect.right).toBeGreaterThan(7);
  expect(delRect.left - editRect.right).toBeLessThan(9);

  const row = edit.closest("tr") as HTMLElement;
  const rowHeight = row.getBoundingClientRect().height;
  expect(rowHeight).toBeGreaterThan(55);
  expect(rowHeight).toBeLessThan(57);

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
  const screen = await render(
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
  await expectNoAccessibilityViolations(screen.container);
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
  await expectNoAccessibilityViolations(screen.container);
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

test("renders each placeholder bar at its own declared width, cycling per column", async () => {
  const screen = await render(
    <Table {...commonProps} columns={columns} rows={emptyRows} loading="initial" />,
  );
  const firstRow = screen.container.querySelector('tbody[aria-hidden="true"] tr') as HTMLElement;
  const cells = firstRow.querySelectorAll("td");
  const nameBar = cells[0]?.querySelector(".bg-surface-sand") as HTMLElement;
  const stockBar = cells[1]?.querySelector(".bg-surface-sand") as HTMLElement;

  const nameTrackWidth = nameBar.parentElement?.getBoundingClientRect().width ?? 0;
  const stockTrackWidth = stockBar.parentElement?.getBoundingClientRect().width ?? 0;

  // The first two entries of PLACEHOLDER_WIDTHS_PERCENT: 72% for column 0, 48% for column 1.
  expect(nameBar.getBoundingClientRect().width / nameTrackWidth).toBeCloseTo(0.72, 1);
  expect(stockBar.getBoundingClientRect().width / stockTrackWidth).toBeCloseTo(0.48, 1);

  await expectNoAccessibilityViolations(screen.container);
});

// loading="initial" means the caller doesn't have a confirmed first result yet, so any rows it
// still passes alongside that (e.g. stale defaults, or leftovers from a previous, now-invalidated
// render) are exactly what the placeholders exist to hide: showing them would flash content the
// caller itself doesn't trust yet. Preventing this in the type system would mean coupling `rows`
// to `loading`'s value (forcing `rows` to an empty tuple only when `loading === "initial"`), a
// constraint no other TableCommonProps field carries and one "updating" explicitly rejects (it
// keeps rows on purpose), so this is proven as an explicit behavior instead.
test("discards any rows the caller still passes while loading is initial, in favor of the placeholders", async () => {
  const screen = await render(
    <Table {...commonProps} columns={columns} rows={rows} loading="initial" />,
  );

  expect(screen.container.querySelectorAll('tbody[aria-hidden="true"] tr')).toHaveLength(5);
  expect(screen.getByText("Coffee").query()).toBeNull();
  expect(screen.getByText("Tea").query()).toBeNull();

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

  await expectNoAccessibilityViolations(screen.container);
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

  const bar = table.previousElementSibling as HTMLElement;
  expect(bar).not.toBeNull();
  expect(getComputedStyle(bar).backgroundColor).toBe(tokenRgb("brand-blue-message-bg"));
  expect(bar.getBoundingClientRect().height).toBe(3);

  await expectNoAccessibilityViolations(screen.container);
});

test("slides the updating bar's segment left to right in a loop", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} loading="updating" />);
  const table = screen.getByRole("table").element() as HTMLElement;
  const bar = table.previousElementSibling as HTMLElement;
  const segment = bar.firstElementChild as HTMLElement;

  const style = getComputedStyle(segment);
  expect(style.animationName).not.toBe("none");
  expect(style.animationIterationCount).toBe("infinite");

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the updating bar's segment still when the system asks for reduced motion", async () => {
  const session = cdp();
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });

  try {
    const screen = await render(<Table {...commonProps} columns={columns} loading="updating" />);
    const table = screen.getByRole("table").element() as HTMLElement;
    const bar = table.previousElementSibling as HTMLElement;
    const segment = bar.firstElementChild as HTMLElement;

    await expect.poll(() => getComputedStyle(segment).animationName).toBe("none");

    await expectNoAccessibilityViolations(screen.container);
  } finally {
    await session.send("Emulation.setEmulatedMedia", { features: [] });
  }
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

test("shows placeholders instead of the empty state while loading is initial, even with an empty prop", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={columns}
      rows={emptyRows}
      loading="initial"
      empty={{
        icon: <PackageSearch />,
        title: "No products yet",
        detail: "Add your first product to see it here.",
        tone: "blank",
      }}
    />,
  );

  expect(screen.container.querySelectorAll('tbody[aria-hidden="true"] tr')).toHaveLength(5);
  expect(screen.getByText("No products yet").query()).toBeNull();

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps showing the current (empty) rows under the loading bar while updating, not the empty state", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={columns}
      rows={emptyRows}
      loading="updating"
      empty={{
        icon: <PackageSearch />,
        title: "No products yet",
        detail: "Add your first product to see it here.",
        tone: "blank",
      }}
    />,
  );

  await expect.element(screen.getByRole("table")).toBeVisible();
  expect(screen.container.querySelectorAll("tbody tr")).toHaveLength(0);
  expect(screen.getByText("No products yet").query()).toBeNull();

  await expectNoAccessibilityViolations(screen.container);
});

test("renders a plain, message-less empty table when there are no rows and no empty prop", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} rows={emptyRows} />);

  await expect.element(screen.getByRole("table")).toBeVisible();
  expect(screen.container.querySelectorAll("tbody tr")).toHaveLength(0);
  await expect.element(screen.getByRole("columnheader", { name: "Producto" })).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the caller's footer below the table", async () => {
  const screen = await render(
    <Table {...commonProps} columns={columns} footer={<p>1-2 of 2</p>} />,
  );

  await expect.element(screen.getByText("1-2 of 2")).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("holds back the footer during the first load, alongside the placeholders", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={columns}
      rows={emptyRows}
      loading="initial"
      footer={<p>1-2 of 2</p>}
    />,
  );

  expect(screen.getByText("1-2 of 2").query()).toBeNull();

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps showing the footer while updating", async () => {
  const screen = await render(
    <Table {...commonProps} columns={columns} loading="updating" footer={<p>1-2 of 2</p>} />,
  );

  await expect.element(screen.getByText("1-2 of 2")).toBeVisible();

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
