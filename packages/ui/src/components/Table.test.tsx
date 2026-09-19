import { PackageSearch } from "lucide-react";
import { act } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import {
  Table,
  TableCellText,
  type TableColumn,
  type TableNonSortableColumn,
  type TableProps,
  type TableRow,
  type TableSort,
} from "./Table";

type Product = { id: string; name: string; sku?: string; stock: string };

const columns: readonly [TableNonSortableColumn<Product>, ...TableNonSortableColumn<Product>[]] = [
  { key: "name", title: "Producto", render: (p) => p.name },
  { key: "stock", title: "Stock", align: "end", render: (p) => p.stock },
];

const rows: TableRow<Product>[] = [
  { id: "1", item: { id: "1", name: "Coffee", stock: "12" } },
  { id: "2", item: { id: "2", name: "Tea", stock: "8" } },
];

// A table without any sortable column, distinguished from a sortable one by its columns' own
// type (see TableNonSortableColumn), never by which props happen to be passed.
type UnsortableTableProps = Extract<TableProps<Product>, { sort?: undefined }>;

function baseProps(overrides: Partial<UnsortableTableProps> = {}): TableProps<Product> {
  return {
    "aria-label": "Products",
    columns,
    rows,
    ...overrides,
  };
}

test("renders a white container with an 8px radius and a 1px line border", async () => {
  const screen = await render(<Table {...baseProps()} />);
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
  const screen = await render(<Table {...baseProps()} />);
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
  const screen = await render(<Table {...baseProps()} />);
  const title = screen.getByRole("columnheader", { name: "Producto" }).element() as HTMLElement;
  const style = getComputedStyle(title);

  expect(style.fontSize).toBe("12px");
  expect(style.fontWeight).toBe("700");
  expect(style.textTransform).toBe("uppercase");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders every row's cells with 16px padding and a 12px gap lined up with the header", async () => {
  const screen = await render(<Table {...baseProps()} />);
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
  const screen = await render(<Table {...baseProps()} />);
  const row = screen.getByRole("cell", { name: "Coffee" }).element().parentElement as HTMLElement;
  const rect = row.getBoundingClientRect();

  expect(rect.height).toBeGreaterThan(55);
  expect(rect.height).toBeLessThan(57);

  await expectNoAccessibilityViolations(screen.container);
});

test("grows a row to 64px when a cell renders a detail line under its main text", async () => {
  const twoLineColumns: readonly [
    TableNonSortableColumn<Product>,
    ...TableNonSortableColumn<Product>[],
  ] = [
    {
      key: "name",
      title: "Producto",
      render: (p) => <TableCellText detail={p.sku}>{p.name}</TableCellText>,
    },
  ];
  const screen = await render(
    <Table
      {...baseProps({
        columns: twoLineColumns,
        rows: [{ id: "1", item: { id: "1", name: "Coffee", sku: "SKU-001", stock: "12" } }],
      })}
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
  const twoLineColumns: readonly [
    TableNonSortableColumn<Product>,
    ...TableNonSortableColumn<Product>[],
  ] = [
    {
      key: "name",
      title: "Producto",
      render: (p) => <TableCellText detail={p.sku}>{p.name}</TableCellText>,
    },
  ];
  const screen = await render(
    <Table
      {...baseProps({
        columns: twoLineColumns,
        rows: [
          {
            id: "1",
            item: { id: "1", name: "Coffee", sku: "SKU-001", stock: "12" },
            state: "muted",
          },
        ],
      })}
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
        {...baseProps({
          rows: [{ id: "1", item: { id: "1", name: longText, stock: "1" } }],
        })}
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
  const screen = await render(<Table {...baseProps()} />);
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
      {...baseProps({ rows: [{ id: "1", item: rows[0]?.item as Product, state: "selected" }] })}
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
      {...baseProps({ rows: [{ id: "1", item: rows[0]?.item as Product, state: "warning" }] })}
    />,
  );
  const row = screen.getByRole("cell", { name: "Coffee" }).element().parentElement as HTMLElement;

  expect(getComputedStyle(row).backgroundColor).toBe(tokenRgb("status-warning-message-bg"));

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the error row state with an error message background", async () => {
  const screen = await render(
    <Table
      {...baseProps({ rows: [{ id: "1", item: rows[0]?.item as Product, state: "error" }] })}
    />,
  );
  const row = screen.getByRole("cell", { name: "Coffee" }).element().parentElement as HTMLElement;

  expect(getComputedStyle(row).backgroundColor).toBe(tokenRgb("status-error-message-bg"));

  await expectNoAccessibilityViolations(screen.container);
});

test("renders every cell of a muted row in secondary text, with its background unchanged", async () => {
  const screen = await render(
    <Table
      {...baseProps({ rows: [{ id: "1", item: rows[0]?.item as Product, state: "muted" }] })}
    />,
  );
  const row = screen.getByRole("cell", { name: "Coffee" }).element().parentElement as HTMLElement;
  const cellText = screen.getByText("Coffee", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(row).backgroundColor).toBe(tokenRgb("surface-white"));
  expect(getComputedStyle(cellText).color).toBe(tokenRgb("ink-secondary"));

  await expectNoAccessibilityViolations(screen.container);
});

test("renders one action button in a 60px wide, unnamed-title actions column named for assistive technology", async () => {
  const actionColumns: readonly [
    TableNonSortableColumn<Product>,
    ...TableNonSortableColumn<Product>[],
  ] = [
    { key: "name", title: "Producto", render: (p) => p.name },
    {
      key: "actions",
      kind: "actions",
      srLabel: "Actions",
      count: 1,
      render: () => <button type="button">Edit</button>,
    },
  ];
  const screen = await render(<Table {...baseProps({ columns: actionColumns })} />);
  const header = screen.getByRole("columnheader", { name: "Actions" }).element() as HTMLElement;

  expect(header.textContent).toBe("Actions");
  expect(getComputedStyle(header).width).toBe("60px");
  await expect.element(screen.getByRole("button", { name: "Edit" }).nth(0)).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("widens the actions column to 104px for two action buttons", async () => {
  const actionColumns: readonly [
    TableNonSortableColumn<Product>,
    ...TableNonSortableColumn<Product>[],
  ] = [
    { key: "name", title: "Producto", render: (p) => p.name },
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
  ];
  const screen = await render(<Table {...baseProps({ columns: actionColumns })} />);
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

const sortableColumns: readonly [TableColumn<Product>, ...TableColumn<Product>[]] = [
  {
    key: "name",
    title: "Producto",
    sortable: true,
    defaultDirection: "ascending",
    render: (p) => p.name,
  },
  {
    key: "stock",
    title: "Stock",
    align: "end",
    sortable: true,
    defaultDirection: "descending",
    render: (p) => p.stock,
  },
];

// A table with a sortable column, so sort and onSortChange are required (see TableProps): a
// sort naming a column outside this set leaves every column here unsorted by default.
type SortableTableProps = Extract<TableProps<Product>, { sort: TableSort }>;

function sortableBaseProps(overrides: Partial<SortableTableProps> = {}): TableProps<Product> {
  return {
    "aria-label": "Products",
    columns: sortableColumns,
    rows,
    sort: { column: "unsorted", direction: "ascending" },
    onSortChange: () => {},
    ...overrides,
  };
}

test("renders an unsorted sortable column with a 12px chevrons-up-down icon, both in secondary text", async () => {
  const screen = await render(<Table {...sortableBaseProps()} />);
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
  const screen = await render(<Table {...sortableBaseProps()} />);
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
    <Table {...sortableBaseProps({ sort: { column: "name", direction: "ascending" } })} />,
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
    <Table {...sortableBaseProps({ sort: { column: "stock", direction: "descending" } })} />,
  );
  const header = screen.getByRole("columnheader", { name: "Stock" }).element() as HTMLElement;
  const icon = header.querySelector("svg") as SVGSVGElement;

  expect(header.getAttribute("aria-sort")).toBe("descending");
  expect(icon.classList.contains("lucide-chevron-down")).toBe(true);

  await expectNoAccessibilityViolations(screen.container);
});

test("asks the caller to sort by a column using its own first direction, on click", async () => {
  const onSortChange = vi.fn();
  const screen = await render(<Table {...sortableBaseProps({ onSortChange })} />);

  await screen.getByRole("columnheader", { name: "Producto" }).click();

  expect(onSortChange).toHaveBeenCalledWith({ column: "name", direction: "ascending" });
  await expectNoAccessibilityViolations(screen.container);
});

test("asks the caller to sort by a column using its own first direction, from the keyboard", async () => {
  const onSortChange = vi.fn();
  await render(<Table {...sortableBaseProps({ onSortChange })} />);

  await userEvent.tab();
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");

  expect(onSortChange).toHaveBeenCalledWith({ column: "stock", direction: "descending" });
});

test("asks for the opposite direction when activating the column already sorted", async () => {
  const onSortChange = vi.fn();
  const screen = await render(
    <Table
      {...sortableBaseProps({
        sort: { column: "name", direction: "ascending" },
        onSortChange,
      })}
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
    columns: readonly [
      {
        key: string;
        title: string;
        sortable: true;
        defaultDirection: "ascending";
        render: (item: Product) => string;
      },
    ];
    rows: TableRow<Product>[];
  }>().not.toExtend<TableProps<Product>>();
});

test("does not accept sort without onSortChange, or onSortChange without sort", () => {
  expectTypeOf<{
    "aria-label": string;
    columns: typeof sortableColumns;
    rows: TableRow<Product>[];
    sort: TableSort;
  }>().not.toExtend<TableProps<Product>>();
  expectTypeOf<{
    "aria-label": string;
    columns: typeof sortableColumns;
    rows: TableRow<Product>[];
    onSortChange: (sort: TableSort) => void;
  }>().not.toExtend<TableProps<Product>>();
});

// vi.useFakeTimers() hangs vitest-browser-react's own render/rerender in this real-browser
// project (their internal waiting also runs on real timers) and corrupts axe-core across later
// tests, so only the table's own 300ms call is intercepted by its exact delay; every other
// setTimeout/clearTimeout call (the test harness's own) keeps running on the real clock. The
// captured callback is invoked manually (inside act, since it fires outside any React-managed
// event) to stand in for the delay elapsing. The fake id is a negative number so it can never
// collide with a real browser timer id (always positive), letting clearTimeout calls for
// unrelated real timers pass through untouched.
function interceptDelay(delayMs: number) {
  const realSetTimeout = window.setTimeout;
  const realClearTimeout = window.clearTimeout;
  const FAKE_ID = -1;
  let callback: (() => void) | undefined;
  let cleared = false;
  const setTimeoutSpy = vi.spyOn(window, "setTimeout").mockImplementation(((
    fn: () => void,
    ms?: number,
    ...args: unknown[]
  ) => {
    if (ms === delayMs) {
      callback = fn;
      cleared = false;
      return FAKE_ID as unknown as ReturnType<typeof setTimeout>;
    }
    return realSetTimeout(fn, ms, ...args);
  }) as typeof window.setTimeout);
  const clearTimeoutSpy = vi.spyOn(window, "clearTimeout").mockImplementation(((
    id?: Parameters<typeof clearTimeout>[0],
  ) => {
    if (id === FAKE_ID) {
      cleared = true;
      return;
    }
    return realClearTimeout(id);
  }) as typeof window.clearTimeout);
  return {
    fire: () => act(() => callback?.()),
    wasCleared: () => cleared,
    restore: () => {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    },
  };
}

test("shows no placeholder rows before the delay elapses, but marks the table busy", async () => {
  const delay = interceptDelay(300);
  try {
    const screen = await render(<Table {...baseProps({ rows: [], loading: "initial" })} />);
    const table = screen.getByRole("table").element() as HTMLElement;

    expect(table.getAttribute("aria-busy")).toBe("true");
    expect(screen.container.querySelectorAll("td")).toHaveLength(0);

    await expectNoAccessibilityViolations(screen.container);
  } finally {
    delay.restore();
  }
});

test("shows 5 placeholder rows, hidden from assistive technology, once the delay elapses", async () => {
  const delay = interceptDelay(300);
  try {
    const screen = await render(<Table {...baseProps({ rows: [], loading: "initial" })} />);

    delay.fire();

    const placeholderRows = screen.container.querySelectorAll('tbody[aria-hidden="true"] tr');
    expect(placeholderRows).toHaveLength(5);

    const placeholderRow = placeholderRows[0] as HTMLElement;
    expect(placeholderRow.getBoundingClientRect().height).toBeGreaterThan(55);
    expect(placeholderRow.getBoundingClientRect().height).toBeLessThan(57);

    await expect.element(screen.getByRole("columnheader", { name: "Producto" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  } finally {
    delay.restore();
  }
});

test("clears the pending timer when loading leaves initial before the delay elapses", async () => {
  const delay = interceptDelay(300);
  try {
    const screen = await render(<Table {...baseProps({ rows: [], loading: "initial" })} />);
    await screen.rerender(<Table {...baseProps({ loading: false })} />);

    expect(delay.wasCleared()).toBe(true);

    delay.fire();

    expect(screen.container.querySelectorAll('tbody[aria-hidden="true"] tr')).toHaveLength(0);
    await expect.element(screen.getByRole("cell", { name: "Coffee" })).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  } finally {
    delay.restore();
  }
});

test("clears the pending timer when the table unmounts before the delay elapses", async () => {
  const delay = interceptDelay(300);
  try {
    const screen = await render(<Table {...baseProps({ rows: [], loading: "initial" })} />);
    await screen.unmount();

    expect(delay.wasCleared()).toBe(true);

    delay.fire();

    expect(screen.container.querySelectorAll('tbody[aria-hidden="true"] tr')).toHaveLength(0);
  } finally {
    delay.restore();
  }
});

test("keeps the current rows and shows a top loading bar while updating", async () => {
  const screen = await render(<Table {...baseProps({ loading: "updating" })} />);
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
      {...baseProps({
        rows: [],
        empty: {
          icon: <PackageSearch />,
          title: "No products yet",
          detail: "Add your first product to see it here.",
          tone: "blank",
        },
      })}
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
      {...baseProps({
        rows: [],
        empty: {
          icon: <PackageSearch />,
          title: "No matches",
          detail: "Try a different filter.",
          tone: "filtered",
          actions: <button type="button">Clear filters</button>,
        },
      })}
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
