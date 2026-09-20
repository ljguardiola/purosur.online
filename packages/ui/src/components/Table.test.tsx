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
  // "clip" instead of "hidden": same clipping and no-scroll behavior, but it's the one that
  // honors overflow-clip-margin below, giving the sortable header's own focus ring (which reaches
  // this same edge) room to paint instead of being cut off by the rounded corner.
  expect(style.overflow).toBe("clip");

  await expectNoAccessibilityViolations(screen.container);
});

test("has no aria-busy when the table isn't loading", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} />);
  const table = screen.getByRole("table").element() as HTMLElement;

  expect(table.hasAttribute("aria-busy")).toBe(false);

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
  const cellText = screen.getByText("Coffee", { exact: true }).element() as HTMLElement;

  expect(style.backgroundColor).toBe(tokenRgb("brand-blue-message-bg"));
  const layers = shadowLayers(style.boxShadow);
  expect(layers[layers.length - 2]).toBe(`${tokenRgb("line")} 0px -1px 0px 0px inset`);
  expect(layers[layers.length - 1]).toBe(`${tokenRgb("brand-blue-ui")} 4px 0px 0px 0px inset`);
  expect(getComputedStyle(cellText).color).toBe(tokenRgb("ink"));

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
  const cellText = screen.getByText("Coffee", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(row).backgroundColor).toBe(tokenRgb("status-warning-message-bg"));
  expect(getComputedStyle(cellText).color).toBe(tokenRgb("ink"));

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
  const cellText = screen.getByText("Coffee", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(row).backgroundColor).toBe(tokenRgb("status-error-message-bg"));
  expect(getComputedStyle(cellText).color).toBe(tokenRgb("ink"));

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
  const firstCellText = screen.getByText("Coffee", { exact: true }).element() as HTMLElement;
  const secondCellText = screen.getByText("12", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(row).backgroundColor).toBe(tokenRgb("surface-white"));
  expect(getComputedStyle(firstCellText).color).toBe(tokenRgb("ink-secondary"));
  expect(getComputedStyle(secondCellText).color).toBe(tokenRgb("ink-secondary"));

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

test("makes the sortable header's own button reach every edge of the header cell, padding included", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "stock", direction: "descending" }}
      onSortChange={() => {}}
    />,
  );
  const header = screen.getByRole("columnheader", { name: "Producto" }).element() as HTMLElement;
  const button = screen.getByRole("button", { name: "Producto" }).element() as HTMLElement;
  const headerRect = header.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();

  expect(buttonRect.left).toBeCloseTo(headerRect.left, 0);
  expect(buttonRect.right).toBeCloseTo(headerRect.right, 0);
  expect(buttonRect.top).toBeCloseTo(headerRect.top, 0);
  expect(buttonRect.bottom).toBeCloseTo(headerRect.bottom, 0);

  await expectNoAccessibilityViolations(screen.container);
});

test("shows a visible focus outline in strong blue when a sortable header is reached by keyboard", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "stock", direction: "descending" }}
      onSortChange={() => {}}
    />,
  );
  const button = screen.getByRole("button", { name: "Producto" }).element() as HTMLElement;

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(button).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(button).outlineOffset).toBe("3px");
  await expect
    .poll(() => getComputedStyle(button).outlineColor)
    .toBe(tokenRgb("brand-blue-strong"));

  await expectNoAccessibilityViolations(screen.container);
});

// The button reaches every edge of its header cell (see the test above proving that), which is
// itself flush against the container's own rounded, clipped edge: without extra room, that ring
// would be cut off exactly where it matters most. overflow-clip-margin (only honored by "clip",
// not "hidden" — confirmed by hand against a screenshot) gives it that room without moving
// anything, so the clip boundary sits at least as far out as the ring's own reach.
test("gives the sortable header's own focus ring room so the container's rounded clip never cuts it off", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "stock", direction: "descending" }}
      onSortChange={() => {}}
    />,
  );
  const button = screen.getByRole("button", { name: "Producto" }).element() as HTMLElement;
  const container = screen.getByRole("table").element().parentElement as HTMLElement;

  await userEvent.tab();

  const buttonStyle = getComputedStyle(button);
  const ringReach =
    Number.parseFloat(buttonStyle.outlineWidth) + Number.parseFloat(buttonStyle.outlineOffset);
  const containerStyle = getComputedStyle(container);

  expect(containerStyle.overflow).toBe("clip");
  expect(
    Number.parseFloat(containerStyle.getPropertyValue("overflow-clip-margin")),
  ).toBeGreaterThanOrEqual(ringReach);

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

// The header asks for a sort; it never decides one. It renders sorted/unsorted from the `sort`
// prop alone and holds nothing of its own, so a caller whose handler does nothing leaves the
// header exactly as it was, never flipping to a sorted look the actual data was never put through.
test("keeps showing the column as unsorted when the caller's onSortChange does nothing", async () => {
  const onSortChange = vi.fn();
  const screen = await render(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "stock", direction: "descending" }}
      onSortChange={onSortChange}
    />,
  );
  const header = screen.getByRole("columnheader", { name: "Producto" }).element() as HTMLElement;
  const icon = header.querySelector("svg") as SVGSVGElement;

  await screen.getByRole("columnheader", { name: "Producto" }).click();

  expect(onSortChange).toHaveBeenCalledWith({ column: "name", direction: "ascending" });
  expect(header.getAttribute("aria-sort")).toBe("none");
  expect(icon.classList.contains("lucide-chevrons-up-down")).toBe(true);

  await expectNoAccessibilityViolations(screen.container);
});

// A widely annotated columns array (see wideColumns below) is the one way `sort.column` can name
// a key absent from `columns` without a cast: TableSortableColumnKey falls back to plain string
// for it, so nothing on the caller's side catches a sort left over from columns the caller since
// removed. The contract: none of the current columns shows as sorted (no column can claim a sort
// aimed at some other, absent one), every sortable header's aria-sort stays "none", and clicking
// a header still sorts by that header's own first direction, unaffected by the stale sort.
const wideSortableColumns: readonly [TableColumn<Product>, ...TableColumn<Product>[]] =
  sortableColumns;

test("shows nothing sorted when sort.column names a column absent from the current columns", async () => {
  const onSortChange = vi.fn();
  const screen = await render(
    <Table
      {...commonProps}
      columns={wideSortableColumns}
      sort={{ column: "removed-column", direction: "ascending" }}
      onSortChange={onSortChange}
    />,
  );
  const nameHeader = screen
    .getByRole("columnheader", { name: "Producto" })
    .element() as HTMLElement;
  const stockHeader = screen.getByRole("columnheader", { name: "Stock" }).element() as HTMLElement;

  expect(nameHeader.getAttribute("aria-sort")).toBe("none");
  expect(stockHeader.getAttribute("aria-sort")).toBe("none");
  const nameTitle = screen.getByText("Producto", { exact: true }).element() as HTMLElement;
  const stockTitle = screen.getByText("Stock", { exact: true }).element() as HTMLElement;
  expect(getComputedStyle(nameTitle).color).toBe(tokenRgb("ink-secondary"));
  expect(getComputedStyle(stockTitle).color).toBe(tokenRgb("ink-secondary"));
  const nameIcon = nameHeader.querySelector("svg") as SVGSVGElement;
  expect(nameIcon.classList.contains("lucide-chevrons-up-down")).toBe(true);

  await screen.getByRole("columnheader", { name: "Producto" }).click();
  expect(onSortChange).toHaveBeenCalledWith({ column: "name", direction: "ascending" });

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

test("renders one placeholder square, right-aligned, for a one-button actions column", async () => {
  const actionColumns = [
    { key: "name", title: "Producto", render: (p: Product) => p.name },
    { key: "actions", kind: "actions", srLabel: "Actions", count: 1, render: () => null },
  ] as const;
  const screen = await render(
    <Table {...commonProps} columns={actionColumns} rows={emptyRows} loading="initial" />,
  );
  const firstRow = screen.container.querySelector('tbody[aria-hidden="true"] tr') as HTMLElement;
  const actionsCell = firstRow.querySelectorAll("td")[1] as HTMLElement;
  const squares = actionsCell.querySelectorAll(".bg-surface-sand");

  expect(squares).toHaveLength(1);
  const squareRect = (squares[0] as HTMLElement).getBoundingClientRect();
  expect(squareRect.width).toBeCloseTo(38, 0);
  expect(squareRect.height).toBeCloseTo(38, 0);
  const cellPaddingRight = Number.parseFloat(getComputedStyle(actionsCell).paddingRight);
  expect(squareRect.right).toBeCloseTo(
    actionsCell.getBoundingClientRect().right - cellPaddingRight,
    0,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("renders two placeholder squares with an 8px gap, right-aligned, for a two-button actions column", async () => {
  const actionColumns = [
    { key: "name", title: "Producto", render: (p: Product) => p.name },
    { key: "actions", kind: "actions", srLabel: "Actions", count: 2, render: () => null },
  ] as const;
  const screen = await render(
    <Table {...commonProps} columns={actionColumns} rows={emptyRows} loading="initial" />,
  );
  const firstRow = screen.container.querySelector('tbody[aria-hidden="true"] tr') as HTMLElement;
  const actionsCell = firstRow.querySelectorAll("td")[1] as HTMLElement;
  const squares = actionsCell.querySelectorAll(".bg-surface-sand");

  expect(squares).toHaveLength(2);
  const [first, second] = Array.from(squares).map((el) =>
    (el as HTMLElement).getBoundingClientRect(),
  );
  expect(first?.width).toBeCloseTo(38, 0);
  expect(second?.width).toBeCloseTo(38, 0);
  expect((second?.left ?? 0) - (first?.right ?? 0)).toBeCloseTo(8, 0);
  const cellPaddingRight = Number.parseFloat(getComputedStyle(actionsCell).paddingRight);
  expect(second?.right).toBeCloseTo(
    actionsCell.getBoundingClientRect().right - cellPaddingRight,
    0,
  );

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

// Unlike the loading bar's segment (a continuous slide, silenced under reduced motion), this
// reveal is a one-time, zero-duration opacity flip after a delay: it carries no motion to
// silence, and the rows still have to become visible, so it keeps running unchanged.
test("still reveals the placeholder rows at 300ms when the system asks for reduced motion", async () => {
  const session = cdp();
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });

  try {
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
  } finally {
    await session.send("Emulation.setEmulatedMedia", { features: [] });
  }

  await expect
    .poll(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    .toBe(false);
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

// The bar's own geometry puts its 3px band exactly over the top 3px of the header row (proven
// separately below), which is where a sortable header's own button starts too (that button fills
// its whole cell, edge to edge). Being merely visual, `aria-hidden`, is not enough on its own: an
// absolutely positioned sibling still receives pointer events by default, so without this it would
// physically catch a click landing in that exact 3px band before it ever reaches the button.
test("does not intercept a click landing on the header underneath the loading bar's own band", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "stock", direction: "descending" }}
      onSortChange={() => {}}
      loading="updating"
    />,
  );
  const table = screen.getByRole("table").element() as HTMLElement;
  const bar = table.previousElementSibling as HTMLElement;
  const button = screen.getByRole("button", { name: "Producto" }).element() as HTMLElement;
  const barRect = bar.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();

  const x = buttonRect.left + 10;
  const y = (barRect.top + barRect.bottom) / 2;

  expect(document.elementFromPoint(x, y)).toBe(button);

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the header's own title text below the loading bar's 3px band", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "stock", direction: "descending" }}
      onSortChange={() => {}}
      loading="updating"
    />,
  );
  const table = screen.getByRole("table").element() as HTMLElement;
  const bar = table.previousElementSibling as HTMLElement;
  const title = screen.getByText("Producto", { exact: true }).element() as HTMLElement;

  expect(title.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    bar.getBoundingClientRect().bottom,
  );

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

test("slides the updating bar's segment exactly from off the left edge to off the right edge, with no dead time", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} loading="updating" />);
  const table = screen.getByRole("table").element() as HTMLElement;
  const bar = table.previousElementSibling as HTMLElement;
  const segment = bar.firstElementChild as HTMLElement;

  const [animation] = segment.getAnimations();
  if (!animation) {
    throw new Error("Expected the updating bar's segment to have a running CSS animation.");
  }
  animation.pause();
  const barRect = bar.getBoundingClientRect();
  const duration = Number((animation.effect as KeyframeEffect).getTiming().duration);

  animation.currentTime = 0;
  expect(segment.getBoundingClientRect().right).toBeCloseTo(barRect.left, 0);

  // 1ms short of the duration itself: at the exact duration, an infinite iteration count
  // resolves to the *next* iteration's start (back at the left edge), not this one's end.
  animation.currentTime = duration - 1;
  expect(segment.getBoundingClientRect().left).toBeCloseTo(barRect.right, 0);

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

  // This file's tests share one browser tab (and CDP session), so a reduced-motion override left
  // in place here would silently carry into whatever test runs next. Proves the revert above
  // actually took effect, instead of trusting the CDP call's success alone.
  await expect
    .poll(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    .toBe(false);
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
  const section = screen.container.querySelector("section") as HTMLElement;
  expect(section.hasAttribute("aria-busy")).toBe(false);

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

// The table can't know what caused the switch to empty (a filter outside it, a search box, a
// deleted row) or whether there's a sensible place inside its own empty state to send focus —
// only the caller, which owns whatever triggered the change, has that context. Landing on
// document.body is the same safe, standard fallback the browser itself produces whenever a
// focused element is removed, not a broken or stuck state, and a caller that wants better (e.g.
// sending focus to its own "Clear filters" action) already has everything it needs to do that
// from the outside: nothing here needs to guess on its behalf.
test("drops focus to document.body, cleanly, when a focused header disappears into the empty state", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "stock", direction: "descending" }}
      onSortChange={() => {}}
    />,
  );
  const header = screen.getByRole("button", { name: "Producto" }).element() as HTMLElement;
  header.focus();
  expect(document.activeElement).toBe(header);

  await screen.rerender(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "stock", direction: "descending" }}
      onSortChange={() => {}}
      rows={emptyRows}
      empty={{
        icon: <PackageSearch />,
        title: "No matches",
        detail: "Try a different filter.",
        tone: "filtered",
      }}
    />,
  );

  expect(screen.container.querySelector("table")).toBeNull();
  expect(document.activeElement).toBe(document.body);

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

// design.pen's own "Backoffice / Productos · Sin resultados" screen keeps its table footer's
// count text ("0 de 215 productos") visible next to the empty state, with no pagination in it
// (nothing to paginate through zero results).
test("keeps showing the footer alongside the empty state", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={columns}
      rows={emptyRows}
      footer={<p>0 of 215 products</p>}
      empty={{
        icon: <PackageSearch />,
        title: "No matches",
        detail: "Try a different filter.",
        tone: "filtered",
      }}
    />,
  );

  await expect.element(screen.getByText("No matches")).toBeVisible();
  await expect.element(screen.getByText("0 of 215 products")).toBeVisible();

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
