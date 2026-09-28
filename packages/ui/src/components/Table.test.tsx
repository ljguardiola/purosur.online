import { PackageSearch, Pencil, Trash2 } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import {
  Table,
  type TableAction,
  TableCellText,
  type TableColumn,
  type TableProps,
  type TableRow,
  type TableSort,
  type TableSortableColumnKey,
  type TableSortDirection,
} from "./Table";

type Product = { id: string; name: string; sku?: string; stock: string };

const columns = [
  { key: "name", title: "Producto", render: (p: Product) => p.name },
  { key: "stock", title: "Stock", align: "end", render: (p: Product) => p.stock },
] as const;

const rows: TableRow<Product>[] = [
  { id: "1", item: { id: "1", name: "Coffee", stock: "12" } },
  { id: "2", item: { id: "2", name: "Tea", stock: "8" } },
];

const emptyRows: TableRow<Product>[] = [];

const commonProps = { "aria-label": "Products", rows };

// getComputedStyle's box-shadow lists every layer; split on top-level commas only, not ones
// nested inside an rgb() color.
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

function paintedTextRight(element: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  const rects = Array.from(range.getClientRects());
  if (rects.length === 0) {
    throw new Error("paintedTextRight: element painted no text (no client rects)");
  }
  return Math.max(...rects.map((rect) => rect.right));
}

test("paintedTextRight throws for an element that paints no text, instead of silently passing", async () => {
  const screen = await render(<span style={{ display: "none" }}>hidden</span>);
  const hidden = screen.container.querySelector("span") as HTMLElement;

  expect(() => paintedTextRight(hidden)).toThrow();
});

// <td> cells fully tile a row, so a hit test always resolves to a <td> and can't prove what
// actually painted through it; reading the rendered pixel is the only way.
async function pixelAt(x: number, y: number): Promise<[number, number, number, number]> {
  // save: false selects the base64-string overload over the { path, base64 } one.
  const base64 = await page.screenshot({ base64: true, save: false });
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("failed to decode the page screenshot"));
  });
  image.src = `data:image/png;base64,${base64}`;
  await loaded;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d") as CanvasRenderingContext2D;
  context.drawImage(image, 0, 0);
  const dpr = window.devicePixelRatio || 1;
  const [r, g, b, a] = context.getImageData(Math.floor(x * dpr), Math.floor(y * dpr), 1, 1).data;
  return [r as number, g as number, b as number, a as number];
}

// page.screenshot() scrolls the page as a side effect of capturing it; this settles that scroll.
async function settleScroll(): Promise<void> {
  await page.screenshot({ base64: true, save: false });
}

function rgbTuple(rgb: string): [number, number, number] {
  const channels = rgb.match(/\d+/g);
  if (channels?.length !== 3) {
    throw new Error(`Not an opaque rgb() color: ${rgb}`);
  }
  return [Number(channels[0]), Number(channels[1]), Number(channels[2])];
}

test("actually paints the selected row's left accent and the row divider, not just declares them", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={columns}
      rows={[
        { id: "1", item: rows[0]?.item as Product, state: "selected" },
        { id: "2", item: rows[1]?.item as Product },
      ]}
    />,
  );
  await settleScroll();
  const row = screen.getByRole("cell", { name: "Coffee" }).element().parentElement as HTMLElement;
  const rect = row.getBoundingClientRect();

  const [ar, ag, ab] = await pixelAt(rect.left + 2, rect.top + 2);
  expect([ar, ag, ab]).toEqual(rgbTuple(tokenRgb("brand-blue-ui")));

  const [dr, dg, db] = await pixelAt(rect.left + 80, rect.bottom - 1);
  expect([dr, dg, db]).toEqual(rgbTuple(tokenRgb("line")));

  const [backgroundControlR, backgroundControlG, backgroundControlB] = await pixelAt(
    rect.left + 80,
    rect.top + 2,
  );
  expect([backgroundControlR, backgroundControlG, backgroundControlB]).toEqual(
    rgbTuple(tokenRgb("brand-blue-message-bg")),
  );
  expect([backgroundControlR, backgroundControlG, backgroundControlB]).not.toEqual([ar, ag, ab]);
  expect([backgroundControlR, backgroundControlG, backgroundControlB]).not.toEqual([dr, dg, db]);
});

// Chromium hit-tests a clipped child against its unexpanded border-box, never the box
// overflow-clip-margin paints into, so the rendered pixel has to be read instead.
test("keeps every corner rounded: no adjacent fill reaches the curve, with a backdrop that matches neither the header's bone nor a row's white", async () => {
  const screen = await render(
    <div
      style={{
        marginTop: "40px",
        marginLeft: "40px",
        width: "300px",
        background: "rgb(0, 255, 0)",
      }}
    >
      <Table {...commonProps} columns={columns} />
    </div>,
  );
  await settleScroll();
  const table = screen.getByRole("table").element() as HTMLElement;
  const container = table.parentElement as HTMLElement;
  const rect = container.getBoundingClientRect();
  // 1.5px lands on the antialiased blend between the backdrop and the container's border.
  const headerBone = rgbTuple(tokenRgb("surface-bone"));
  const rowWhite = rgbTuple(tokenRgb("surface-white"));

  for (const [name, x, y, adjacentFill] of [
    ["topLeft", rect.left + 1.5, rect.top + 1.5, headerBone],
    ["topRight", rect.right - 1.5, rect.top + 1.5, headerBone],
    ["bottomLeft", rect.left + 1.5, rect.bottom - 1.5, rowWhite],
    ["bottomRight", rect.right - 1.5, rect.bottom - 1.5, rowWhite],
  ] as const) {
    const [r, g, b] = await pixelAt(x, y);
    expect(
      g,
      `${name} wasn't green-dominant — the probe isn't reading the backdrop`,
    ).toBeGreaterThan(r);
    expect(
      g,
      `${name} wasn't green-dominant — the probe isn't reading the backdrop`,
    ).toBeGreaterThan(b);
    expect([r, g, b], `${name} matched its adjacent row's own fill color exactly`).not.toEqual(
      adjacentFill,
    );
  }

  await expectNoAccessibilityViolations(screen.container);
});

test("renders a white container with an 8px radius and a 1px line border", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} />);
  const container = screen.getByRole("table").element().parentElement as HTMLElement;
  const style = getComputedStyle(container);

  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.borderRadius).toBe("8px");
  expect(style.borderWidth).toBe("1px");
  expect(style.borderColor).toBe(tokenRgb("line"));
  // "hidden" stays scrollable via element.scrollTo(); "clip" doesn't.
  expect(style.overflow).toBe("clip");
});

test("has no aria-busy when the table isn't loading", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} />);
  const table = screen.getByRole("table").element() as HTMLElement;

  expect(table.hasAttribute("aria-busy")).toBe(false);
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
  // Overriding a table tag's display drops its implicit ARIA role in some engines.
  expect(getComputedStyle(table).display).toBe("table");
  expect(getComputedStyle(thead).display).toBe("table-header-group");
  expect(getComputedStyle(tbody).display).toBe("table-row-group");
  expect(getComputedStyle(headerRow).display).toBe("table-row");
  expect(getComputedStyle(headerCell).display).toBe("table-cell");
  expect(getComputedStyle(bodyRow).display).toBe("table-row");
  expect(getComputedStyle(bodyCell).display).toBe("table-cell");
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
  expect(firstStyle.paddingLeft).toBe("16px");
  expect(lastStyle.paddingRight).toBe("16px");
  expect(firstStyle.paddingRight).toBe("6px");
  expect(lastStyle.paddingLeft).toBe("6px");
});

test("wraps a long, unbreakable plain header title instead of overrunning the next column", async () => {
  const longColumns = [
    {
      key: "name",
      title: "Superlongunbreakabletitlethatwouldnotwraponitsown",
      render: (p: Product) => p.name,
    },
    { key: "stock", title: "Stock", align: "end", render: (p: Product) => p.stock },
  ] as const;
  const screen = await render(<Table {...commonProps} columns={longColumns} />);
  const firstHeader = screen
    .getByRole("columnheader", { name: "Superlongunbreakabletitlethatwouldnotwraponitsown" })
    .element() as HTMLElement;
  const titleSpan = firstHeader.querySelector("span") as HTMLElement;

  expect(getComputedStyle(firstHeader).overflowWrap).toBe("break-word");
  expect(titleSpan.getBoundingClientRect().right).toBeLessThanOrEqual(
    firstHeader.getBoundingClientRect().right,
  );
  expect(paintedTextRight(titleSpan)).toBeLessThanOrEqual(
    firstHeader.getBoundingClientRect().right,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("wraps a long, unbreakable sortable header title instead of overrunning the next column", async () => {
  const longColumns = [
    {
      key: "name",
      title: "Superlongunbreakabletitlethatwouldnotwraponitsown",
      sortable: true,
      defaultDirection: "ascending",
      render: (p: Product) => p.name,
    },
    { key: "stock", title: "Stock", align: "end", render: (p: Product) => p.stock },
  ] as const;
  const screen = await render(
    <Table
      {...commonProps}
      columns={longColumns}
      sort={{ column: "name", direction: "ascending" }}
      onSortChange={() => {}}
    />,
  );
  const firstHeader = screen
    .getByRole("columnheader", { name: "Superlongunbreakabletitlethatwouldnotwraponitsown" })
    .element() as HTMLElement;
  const titleSpan = firstHeader.querySelector("span") as HTMLElement;

  // min-w-0 only shrinks the span's box; break-words on the <th> is what actually wraps the text.
  expect(getComputedStyle(firstHeader).overflowWrap).toBe("break-word");
  expect(titleSpan.getBoundingClientRect().right).toBeLessThanOrEqual(
    firstHeader.getBoundingClientRect().right,
  );
  expect(paintedTextRight(titleSpan)).toBeLessThanOrEqual(
    firstHeader.getBoundingClientRect().right,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("renders 12px bold capital column titles", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} />);
  const title = screen.getByRole("columnheader", { name: "Producto" }).element() as HTMLElement;
  const style = getComputedStyle(title);

  expect(style.fontSize).toBe("12px");
  expect(style.fontWeight).toBe("700");
  expect(style.textTransform).toBe("uppercase");
});

test("still renders every row, each with its own content, when two rows share the same id", async () => {
  const dupRows: TableRow<Product>[] = [
    { id: "1", item: { id: "1", name: "Coffee", stock: "12" } },
    { id: "1", item: { id: "1", name: "Tea", stock: "8" } },
  ];
  const screen = await render(<Table aria-label="Products" columns={columns} rows={dupRows} />);

  await expect.element(screen.getByRole("cell", { name: "Coffee" })).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "Tea" })).toBeVisible();
  expect(screen.container.querySelectorAll("tbody tr")).toHaveLength(2);

  await expectNoAccessibilityViolations(screen.container);
});

test("shows both columns as sorted when they share a key that matches the current sort", async () => {
  const dupColumns = [
    {
      key: "same",
      title: "Producto",
      sortable: true,
      defaultDirection: "ascending",
      render: (p: Product) => p.name,
    },
    {
      key: "same",
      title: "Stock",
      align: "end",
      sortable: true,
      defaultDirection: "ascending",
      render: (p: Product) => p.stock,
    },
  ] as const;
  const screen = await render(
    <Table
      {...commonProps}
      columns={dupColumns}
      sort={{ column: "same", direction: "ascending" }}
      onSortChange={() => {}}
    />,
  );
  const headers = screen.container.querySelectorAll("th");

  expect(Array.from(headers).map((h) => h.getAttribute("aria-sort"))).toEqual([
    "ascending",
    "ascending",
  ]);

  await expectNoAccessibilityViolations(screen.container);
});

test("skips its own bottom divider on the last row, since the container's own border already closes it", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} />);
  const lastCell = screen.getByRole("cell", { name: "8" }).element() as HTMLElement;
  const lastRow = lastCell.parentElement as HTMLElement;
  const container = screen.getByRole("table").element().parentElement as HTMLElement;

  const rowRect = lastRow.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  expect(containerRect.bottom - rowRect.bottom).toBeCloseTo(1, 0);
  const layers = shadowLayers(getComputedStyle(lastRow).boxShadow);
  expect(layers.some((layer) => layer.includes("-1px 0px 0px inset"))).toBe(false);
});

test("keeps the selected row's own left accent on the last row, with no bottom divider layer", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={columns}
      rows={[{ id: "1", item: rows[0]?.item as Product, state: "selected" }]}
    />,
  );
  const row = screen.getByRole("cell", { name: "Coffee" }).element().parentElement as HTMLElement;
  const layers = shadowLayers(getComputedStyle(row).boxShadow);

  expect(layers.some((layer) => layer.includes("-1px 0px 0px inset"))).toBe(false);
  expect(layers[layers.length - 1]).toBe(`${tokenRgb("brand-blue-ui")} 4px 0px 0px 0px inset`);

  await expectNoAccessibilityViolations(screen.container);
});

test("skips its own bottom divider on the last placeholder row too, while loading is initial", async () => {
  const screen = await render(
    <Table {...commonProps} columns={columns} rows={emptyRows} loading="initial" />,
  );
  const placeholderRows = screen.container.querySelectorAll('tbody[aria-hidden="true"] tr');
  const lastPlaceholderRow = placeholderRows[placeholderRows.length - 1] as HTMLElement;
  const otherPlaceholderRow = placeholderRows[0] as HTMLElement;
  const container = screen.getByRole("table").element().parentElement as HTMLElement;

  const rowRect = lastPlaceholderRow.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  expect(containerRect.bottom - rowRect.bottom).toBeCloseTo(1, 0);
  const lastLayers = shadowLayers(getComputedStyle(lastPlaceholderRow).boxShadow);
  expect(lastLayers.some((layer) => layer.includes("-1px 0px 0px inset"))).toBe(false);
  const otherLayers = shadowLayers(getComputedStyle(otherPlaceholderRow).boxShadow);
  expect(otherLayers.some((layer) => layer.includes("-1px 0px 0px inset"))).toBe(true);
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
});

test("renders a 56px row when every cell holds a single line", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} />);
  const row = screen.getByRole("cell", { name: "Coffee" }).element().parentElement as HTMLElement;
  const rect = row.getBoundingClientRect();

  expect(rect.height).toBeGreaterThan(55);
  expect(rect.height).toBeLessThan(57);
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
});

test("renders no detail line when no detail is given", async () => {
  const screen = await render(<TableCellText>Coffee</TableCellText>);

  expect(screen.container.querySelectorAll("span")).toHaveLength(1);
});

test("renders no detail line for a boolean detail, like the common item.sku !== undefined && item.sku pattern", async () => {
  const falseScreen = await render(<TableCellText detail={false}>Coffee</TableCellText>);
  expect(falseScreen.container.querySelectorAll("span")).toHaveLength(1);
  await expectNoAccessibilityViolations(falseScreen.container);

  const trueScreen = await render(<TableCellText detail={true}>Coffee</TableCellText>);
  expect(trueScreen.container.querySelectorAll("span")).toHaveLength(1);
  await expectNoAccessibilityViolations(trueScreen.container);
});

test("lays out a cell whose render returns several elements with the same 4px gap TableCellText uses", async () => {
  const fragmentColumns = [
    {
      key: "name",
      title: "Producto",
      render: () => (
        <>
          <span className="block">Line A</span>
          <span className="block">Line B</span>
        </>
      ),
    },
  ] as const;
  const screen = await render(
    <Table {...commonProps} columns={fragmentColumns} rows={[rows[0] as TableRow<Product>]} />,
  );
  const lineA = screen.getByText("Line A").element() as HTMLElement;
  const lineB = screen.getByText("Line B").element() as HTMLElement;

  const gap = lineB.getBoundingClientRect().top - lineA.getBoundingClientRect().bottom;
  expect(gap).toBeCloseTo(4, 0);

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
  // Checked against the content edge (border box minus padding), not the border box itself.
  const cellPaddingRight = Number.parseFloat(getComputedStyle(cell).paddingRight);
  expect(paintedTextRight(cellText)).toBeLessThanOrEqual(
    cell.getBoundingClientRect().right - cellPaddingRight,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("breaks a long unbreakable token inside an align:end cell instead of overrunning the previous column", async () => {
  const barcode = "1234567890123456789012345678901234567890";
  const screen = await render(
    <div style={{ width: "320px" }}>
      <Table
        {...commonProps}
        columns={columns}
        rows={[{ id: "1", item: { id: "1", name: "x", stock: barcode } }]}
      />
    </div>,
  );
  const cellText = screen.getByText(barcode, { exact: true }).element() as HTMLElement;
  const cell = cellText.closest("td") as HTMLElement;

  expect(getComputedStyle(cell).overflowWrap).toBe("break-word");
  const range = document.createRange();
  range.selectNodeContents(cellText);
  const minLeft = Math.min(...Array.from(range.getClientRects()).map((rect) => rect.left));
  const cellPaddingLeft = Number.parseFloat(getComputedStyle(cell).paddingLeft);
  expect(minLeft).toBeGreaterThanOrEqual(cell.getBoundingClientRect().left + cellPaddingLeft);

  await expectNoAccessibilityViolations(screen.container);
});

test("right-aligns a numeric column in the header and the rows, with tabular digits", async () => {
  const screen = await render(<Table {...commonProps} columns={columns} />);
  const header = screen.getByRole("columnheader", { name: "Stock" }).element() as HTMLElement;
  const cell = screen.getByRole("cell", { name: "12" }).element() as HTMLElement;
  const cellText = screen.getByText("12", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(header).textAlign).toBe("right");
  expect(getComputedStyle(cell).textAlign).toBe("right");
  expect(getComputedStyle(cell).fontVariantNumeric).toContain("tabular-nums");
  // text-align doesn't govern the value's box position in the cell's flex column; painted
  // position does.
  expect(cellText.getBoundingClientRect().right).toBeCloseTo(
    cell.getBoundingClientRect().right - 16,
    0,
  );
});

test("right-aligns a sortable end-aligned header's own title and icon, not just its text-align", async () => {
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

  expect(icon.getBoundingClientRect().right).toBeCloseTo(
    header.getBoundingClientRect().right - 16,
    0,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the selected row state with a blue message background and a 4px blue left edge", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={columns}
      rows={[
        { id: "1", item: rows[0]?.item as Product, state: "selected" },
        { id: "2", item: rows[1]?.item as Product },
      ]}
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
});

test("renders one IconButton at its own 38x38px in an 82px wide, unnamed-title actions column named for assistive technology", async () => {
  const actionColumns = [
    { key: "name", title: "Producto", render: (p: Product) => p.name },
    {
      key: "actions",
      kind: "actions",
      srLabel: "Actions",
      actions: [() => ({ icon: <Pencil />, "aria-label": "Edit", onPress: () => {} })],
    },
  ] as const;
  const screen = await render(<Table {...commonProps} columns={actionColumns} />);
  const header = screen.getByRole("columnheader", { name: "Actions" }).element() as HTMLElement;

  expect(header.textContent).toBe("Actions");
  const srOnlyLabel = header.querySelector("span") as HTMLElement;
  const srOnlyRect = srOnlyLabel.getBoundingClientRect();
  expect(srOnlyRect.width).toBeLessThanOrEqual(1);
  expect(srOnlyRect.height).toBeLessThanOrEqual(1);
  const oneActionColumnWidthPx = 60 + 6 + 16;
  expect(getComputedStyle(header).width).toBe(`${oneActionColumnWidthPx}px`);
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
});

test("renders two IconButtons at their own 38x38px with an 8px gap, right-aligned, in a 126px actions column", async () => {
  const actionColumns = [
    { key: "name", title: "Producto", render: (p: Product) => p.name },
    {
      key: "actions",
      kind: "actions",
      srLabel: "Actions",
      actions: [
        () => ({ icon: <Pencil />, "aria-label": "Edit", onPress: () => {} }),
        () => ({ icon: <Trash2 />, "aria-label": "Delete", onPress: () => {} }),
      ],
    },
  ] as const;
  const screen = await render(<Table {...commonProps} columns={actionColumns} />);
  const header = screen.getByRole("columnheader", { name: "Actions" }).element() as HTMLElement;

  const twoActionColumnWidthPx = 104 + 6 + 16;
  expect(getComputedStyle(header).width).toBe(`${twoActionColumnWidthPx}px`);

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
});

test("keeps focus on the action button when its own label changes with the item's state", async () => {
  type ToggleItem = { id: string; active: boolean };
  const toggleColumns = [
    {
      key: "actions",
      kind: "actions",
      srLabel: "Actions",
      actions: [
        (item: ToggleItem) => ({
          icon: <Pencil />,
          "aria-label": item.active ? "Desactivar" : "Activar",
          onPress: () => {},
        }),
      ],
    },
  ] as const;
  const screen = await render(
    <Table
      aria-label="Products"
      columns={toggleColumns}
      rows={[{ id: "1", item: { id: "1", active: false } }]}
    />,
  );
  const button = screen.getByRole("button", { name: "Activar" }).element() as HTMLElement;
  button.focus();
  expect(document.activeElement).toBe(button);

  await screen.rerender(
    <Table
      aria-label="Products"
      columns={toggleColumns}
      rows={[{ id: "1", item: { id: "1", active: true } }]}
    />,
  );

  expect(document.activeElement).toBe(button);
  expect(button.getAttribute("aria-label")).toBe("Desactivar");

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the second action's own identity untouched when an update makes the first action's label collide with it", async () => {
  type Item = { id: string };
  const onEdit = vi.fn();
  const onEditAgain = vi.fn();
  const columnsBeforeCollision = [
    {
      key: "actions",
      kind: "actions",
      srLabel: "Actions",
      actions: [
        (_item: Item) => ({ icon: <Pencil />, "aria-label": "Modify", onPress: onEdit }),
        (_item: Item) => ({ icon: <Trash2 />, "aria-label": "Edit", onPress: onEditAgain }),
      ],
    },
  ] as const;
  const columnsWithCollision = [
    {
      key: "actions",
      kind: "actions",
      srLabel: "Actions",
      actions: [
        (_item: Item) => ({ icon: <Pencil />, "aria-label": "Edit", onPress: onEdit }),
        (_item: Item) => ({ icon: <Trash2 />, "aria-label": "Edit", onPress: onEditAgain }),
      ],
    },
  ] as const;

  const screen = await render(
    <Table
      aria-label="Products"
      columns={columnsBeforeCollision}
      rows={[{ id: "1", item: { id: "1" } }]}
    />,
  );
  const editAgainButton = screen.getByRole("button", { name: "Edit" }).element() as HTMLElement;
  editAgainButton.focus();
  expect(document.activeElement).toBe(editAgainButton);

  await screen.rerender(
    <Table
      aria-label="Products"
      columns={columnsWithCollision}
      rows={[{ id: "1", item: { id: "1" } }]}
    />,
  );

  const editButtons = screen.getByRole("button", { name: "Edit" }).elements() as HTMLElement[];
  expect(editButtons).toHaveLength(2);

  expect(document.activeElement).toBe(editAgainButton);
  editAgainButton.click();
  expect(onEditAgain).toHaveBeenCalledOnce();
  expect(onEdit).not.toHaveBeenCalled();

  await expectNoAccessibilityViolations(screen.container);
});

test("renders no button at all for a row whose action reports undefined, keeping the button for other rows", async () => {
  type Item = { id: string; isAdministrator: boolean };
  const itemRows: TableRow<Item>[] = [
    { id: "1", item: { id: "1", isAdministrator: true } },
    { id: "2", item: { id: "2", isAdministrator: false } },
  ];
  const hideableColumns = [
    { key: "name", title: "Rol", render: (item: Item) => item.id },
    {
      key: "actions",
      kind: "actions",
      srLabel: "Actions",
      actions: [
        (item: Item) =>
          item.isAdministrator
            ? undefined
            : { icon: <Pencil />, "aria-label": `Edit ${item.id}`, onPress: () => {} },
      ],
    },
  ] as const;

  const screen = await render(
    <Table aria-label="Roles" columns={hideableColumns} rows={itemRows} />,
  );

  expect(screen.getByRole("button", { name: "Edit 1" }).query()).toBeNull();
  await expect.element(screen.getByRole("button", { name: "Edit 2" })).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the first action in the same column position across rows even when the second action is hidden on one of them", async () => {
  type Item = { id: string; isAdministrator: boolean };
  const itemRows: TableRow<Item>[] = [
    { id: "1", item: { id: "1", isAdministrator: true } },
    { id: "2", item: { id: "2", isAdministrator: false } },
  ];
  const twoActionColumns = [
    { key: "name", title: "Rol", render: (item: Item) => item.id },
    {
      key: "actions",
      kind: "actions",
      srLabel: "Actions",
      actions: [
        (item: Item) => ({
          icon: <PackageSearch />,
          "aria-label": `Copy ${item.id}`,
          onPress: () => {},
        }),
        (item: Item) =>
          item.isAdministrator
            ? undefined
            : { icon: <Pencil />, "aria-label": `Edit ${item.id}`, onPress: () => {} },
      ],
    },
  ] as const;

  const screen = await render(
    <Table aria-label="Roles" columns={twoActionColumns} rows={itemRows} />,
  );

  const copyOnAdminRow = screen.getByRole("button", { name: "Copy 1" }).element() as HTMLElement;
  const copyOnOtherRow = screen.getByRole("button", { name: "Copy 2" }).element() as HTMLElement;

  expect(copyOnAdminRow.getBoundingClientRect().left).toBeCloseTo(
    copyOnOtherRow.getBoundingClientRect().left,
    0,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("hides a missing action behind an invisible, non-focusable placeholder instead of collapsing its slot", async () => {
  type Item = { id: string; isAdministrator: boolean };
  const itemRows: TableRow<Item>[] = [{ id: "1", item: { id: "1", isAdministrator: true } }];
  const twoActionColumns = [
    { key: "name", title: "Rol", render: (item: Item) => item.id },
    {
      key: "actions",
      kind: "actions",
      srLabel: "Actions",
      actions: [
        (item: Item) => ({
          icon: <PackageSearch />,
          "aria-label": `Copy ${item.id}`,
          onPress: () => {},
        }),
        (item: Item) =>
          item.isAdministrator
            ? undefined
            : { icon: <Pencil />, "aria-label": `Edit ${item.id}`, onPress: () => {} },
      ],
    },
  ] as const;

  const screen = await render(
    <Table aria-label="Roles" columns={twoActionColumns} rows={itemRows} />,
  );

  const copyButton = screen.getByRole("button", { name: "Copy 1" }).element() as HTMLElement;
  const actionsCell = copyButton.closest("td") as HTMLElement;
  const actionsWrapper = actionsCell.firstElementChild as HTMLElement;
  const placeholder = actionsWrapper.lastElementChild as HTMLElement;

  expect(placeholder.tagName).not.toBe("BUTTON");
  expect(placeholder.getAttribute("aria-hidden")).toBe("true");
  expect(placeholder.tabIndex).toBeLessThan(0);
  const placeholderRect = placeholder.getBoundingClientRect();
  const copyRect = copyButton.getBoundingClientRect();
  expect(placeholderRect.width).toBeCloseTo(copyRect.width, 0);
  expect(placeholderRect.height).toBeCloseTo(copyRect.height, 0);

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a column without a title, or an actions column without its own fields", () => {
  expectTypeOf<{ key: string; render: (item: Product) => string }>().not.toExtend<
    TableColumn<Product>
  >();
  expectTypeOf<{ key: string; kind: "actions"; render: (item: Product) => string }>().not.toExtend<
    TableColumn<Product>
  >();
  expectTypeOf<{ key: string; kind: "actions"; srLabel: string }>().not.toExtend<
    TableColumn<Product>
  >();
  expectTypeOf<{
    key: string;
    kind: "actions";
    actions: readonly [TableAction<Product>];
  }>().not.toExtend<TableColumn<Product>>();
});

test("does not accept an actions column with zero or three actions", () => {
  expectTypeOf<{ key: string; kind: "actions"; srLabel: string; actions: [] }>().not.toExtend<
    TableColumn<Product>
  >();
  expectTypeOf<{
    key: string;
    kind: "actions";
    srLabel: string;
    actions: [TableAction<Product>, TableAction<Product>, TableAction<Product>];
  }>().not.toExtend<TableColumn<Product>>();
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

test("shows the hand cursor on the sortable header button and on each row action", async () => {
  const actionColumns = [
    { key: "name", title: "Producto", render: (p: Product) => p.name },
    {
      key: "actions",
      kind: "actions",
      srLabel: "Actions",
      actions: [() => ({ icon: <Pencil />, "aria-label": "Edit", onPress: () => {} })],
    },
  ] as const;
  const screen = await render(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "stock", direction: "descending" }}
      onSortChange={() => {}}
    />,
  );
  const header = screen.getByRole("button", { name: "Producto" }).element() as HTMLElement;
  expect(getComputedStyle(header).cursor).toBe("pointer");
  await screen.unmount();

  const actionsScreen = await render(<Table {...commonProps} columns={actionColumns} />);
  const edit = actionsScreen.getByRole("button", { name: "Edit" }).nth(0).element() as HTMLElement;
  expect(getComputedStyle(edit).cursor).toBe("pointer");
});

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
});

test("does not accept a non-literal boolean sortable value, alone or beside a genuinely sortable column", () => {
  type MinimalItem = { id: string; name: string };
  expectTypeOf<{
    key: string;
    title: string;
    sortable: boolean;
    defaultDirection: TableSortDirection;
    render: (item: MinimalItem) => string;
  }>().not.toExtend<TableColumn<MinimalItem>>();

  expectTypeOf<{
    key: string;
    title: string;
    sortable: true;
    defaultDirection: TableSortDirection;
    render: (item: MinimalItem) => string;
  }>().toExtend<TableColumn<MinimalItem>>();

  expectTypeOf<
    [
      {
        key: "name";
        title: string;
        sortable: true;
        defaultDirection: TableSortDirection;
        render: (item: MinimalItem) => string;
      },
      {
        key: "other";
        title: string;
        sortable: boolean;
        defaultDirection: TableSortDirection;
        render: (item: MinimalItem) => string;
      },
    ]
  >().not.toExtend<readonly [TableColumn<MinimalItem>, ...TableColumn<MinimalItem>[]]>();
});

test("infers literal column keys from an inline columns array, without `as const`", () => {
  type MinimalItem = { id: string; value: string };
  const element = (
    <Table
      aria-label="Items"
      rows={[] as TableRow<MinimalItem>[]}
      columns={[
        {
          key: "value",
          title: "Value",
          sortable: true,
          defaultDirection: "ascending",
          render: (item: MinimalItem) => item.value,
        },
      ]}
      sort={{ column: "value", direction: "ascending" }}
      onSortChange={(sort) => {
        expectTypeOf(sort.column).toEqualTypeOf<"value">();
      }}
    />
  );
  expectTypeOf(element).not.toBeNever();
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

test("keeps the sortable header's own button matching a wrapped title's grown header box, not just the 44px floor", async () => {
  const wrappedColumns = [
    {
      key: "name",
      title: "Superlongunbreakabletitlethatwouldwraptotwoormorelines",
      sortable: true,
      defaultDirection: "ascending",
      render: (p: Product) => p.name,
    },
    { key: "stock", title: "Stock", align: "end", render: (p: Product) => p.stock },
  ] as const;
  const screen = await render(
    <div style={{ width: "320px" }}>
      <Table
        {...commonProps}
        columns={wrappedColumns}
        sort={{ column: "name", direction: "ascending" }}
        onSortChange={() => {}}
      />
    </div>,
  );
  const header = screen
    .getByRole("columnheader", { name: /Superlongunbreakable/ })
    .element() as HTMLElement;
  const button = screen
    .getByRole("button", { name: /Superlongunbreakable/ })
    .element() as HTMLElement;
  const headerRect = header.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();

  expect(headerRect.height).toBeGreaterThan(44);
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
  await expect.poll(() => getComputedStyle(button).outlineOffset).toBe("-3px");
  await expect
    .poll(() => getComputedStyle(button).outlineColor)
    .toBe(tokenRgb("brand-blue-strong"));

  await expectNoAccessibilityViolations(screen.container);
});

test("hovers a sortable header to surface-sand, since it sits on the header row's own bone background", async () => {
  interface DispatchableCdpSession {
    send(
      method: "Input.dispatchMouseEvent",
      params: { type: "mouseMoved"; x: number; y: number },
    ): Promise<unknown>;
  }
  const screen = await render(
    <Table
      {...commonProps}
      columns={sortableColumns}
      sort={{ column: "stock", direction: "descending" }}
      onSortChange={() => {}}
    />,
  );
  const button = screen.getByRole("button", { name: "Producto" }).element() as HTMLElement;
  const headerRow = button.closest("tr") as HTMLElement;
  const rect = button.getBoundingClientRect();

  expect(getComputedStyle(button).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(getComputedStyle(headerRow).backgroundColor).toBe(tokenRgb("surface-bone"));

  const session = cdp() as unknown as DispatchableCdpSession;
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  });

  expect(button.getAttribute("data-hovered")).toBe("true");
  expect(getComputedStyle(button).backgroundColor).toBe(tokenRgb("surface-sand"));

  await expectNoAccessibilityViolations(screen.container);
});

// WebKit's overflow-clip-margin doesn't reliably give an outward ring room past the clipped edge.
test("paints the sortable header's own focus ring inside the container, never past its edge", async () => {
  const screen = await render(
    <div style={{ marginTop: "40px", marginLeft: "40px", width: "300px", background: "white" }}>
      <Table
        {...commonProps}
        columns={sortableColumns}
        sort={{ column: "stock", direction: "descending" }}
        onSortChange={() => {}}
      />
    </div>,
  );
  await settleScroll();
  const button = screen.getByRole("button", { name: "Producto" }).element() as HTMLElement;
  const container = (screen.getByRole("table").element() as HTMLElement)
    .parentElement as HTMLElement;

  const scrollYBeforeFocus = window.scrollY;
  await userEvent.tab();
  expect(button.getAttribute("data-focus-visible")).toBe("true");
  expect(getComputedStyle(button).outlineOffset).toBe("-3px");
  // Focus can scroll the page, so rects are read only after this second settle.
  await settleScroll();
  expect(window.scrollY).toBe(scrollYBeforeFocus);

  const rect = container.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const y = buttonRect.top + buttonRect.height / 2;

  const insideRingBand = await pixelAt(rect.left + 1.5, y);
  expect(insideRingBand.slice(0, 3)).toEqual(rgbTuple(tokenRgb("brand-blue-strong")));

  const justOutsideContainer = await pixelAt(rect.left - 1, y);
  expect(justOutsideContainer.slice(0, 3)).not.toEqual(rgbTuple(tokenRgb("brand-blue-strong")));

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

  const firstColumnPlaceholderWidthFraction = 0.72;
  const secondColumnPlaceholderWidthFraction = 0.48;
  expect(nameBar.getBoundingClientRect().width / nameTrackWidth).toBeCloseTo(
    firstColumnPlaceholderWidthFraction,
    1,
  );
  expect(stockBar.getBoundingClientRect().width / stockTrackWidth).toBeCloseTo(
    secondColumnPlaceholderWidthFraction,
    1,
  );
});

test("renders one placeholder square, right-aligned, for a one-button actions column", async () => {
  const actionColumns = [
    { key: "name", title: "Producto", render: (p: Product) => p.name },
    {
      key: "actions",
      kind: "actions",
      srLabel: "Actions",
      actions: [() => ({ icon: <Pencil />, "aria-label": "Edit", onPress: () => {} })],
    },
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
    {
      key: "actions",
      kind: "actions",
      srLabel: "Actions",
      actions: [
        () => ({ icon: <Pencil />, "aria-label": "Edit", onPress: () => {} }),
        () => ({ icon: <Trash2 />, "aria-label": "Delete", onPress: () => {} }),
      ],
    },
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

test("discards any rows the caller still passes while loading is initial, in favor of the placeholders", async () => {
  const screen = await render(
    <Table {...commonProps} columns={columns} rows={rows} loading="initial" />,
  );

  expect(screen.container.querySelectorAll('tbody[aria-hidden="true"] tr')).toHaveLength(5);
  expect(screen.getByText("Coffee").query()).toBeNull();
  expect(screen.getByText("Tea").query()).toBeNull();
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

// A one-time opacity flip carries no continuous motion for prefers-reduced-motion to silence.
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
});

// An absolutely positioned sibling still receives pointer events by default even when aria-hidden.
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

// Pausing a compositor transform animation from script doesn't reliably reach the painted frame;
// reduced motion does, and the screenshot-based pixel read needs the segment still.
test("keeps a hovered, unfocused header's own hover fill under the updating bar", async () => {
  interface DispatchableCdpSession {
    send(
      method: "Input.dispatchMouseEvent",
      params: { type: "mouseMoved"; x: number; y: number },
    ): Promise<unknown>;
  }
  const session = cdp();
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });

  try {
    const screen = await render(
      <Table
        {...commonProps}
        columns={sortableColumns}
        sort={{ column: "stock", direction: "descending" }}
        onSortChange={() => {}}
        loading="updating"
      />,
    );
    await settleScroll();
    const table = screen.getByRole("table").element() as HTMLElement;
    const bar = table.previousElementSibling as HTMLElement;
    const segment = bar.firstElementChild as HTMLElement;
    const button = screen.getByRole("button", { name: "Stock" }).element() as HTMLElement;
    const buttonRect = button.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    const x = buttonRect.left + buttonRect.width / 2;

    await expect.poll(() => segment.getAnimations()).toHaveLength(0);
    expect(segment.getBoundingClientRect().right).toBeLessThan(x);

    await (session as unknown as DispatchableCdpSession).send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y: buttonRect.top + buttonRect.height / 2,
    });
    await settleScroll();

    expect(button.getAttribute("data-hovered")).toBe("true");
    expect(button.getAttribute("data-focus-visible")).toBeNull();

    const pixel = await pixelAt(x, barRect.top + 1);
    const control = await pixelAt(x, barRect.bottom + 1);

    expect(pixel.slice(0, 3)).toEqual(rgbTuple(tokenRgb("brand-blue-message-bg")));
    expect(control.slice(0, 3)).toEqual(rgbTuple(tokenRgb("surface-sand")));

    await expectNoAccessibilityViolations(screen.container);
  } finally {
    await session.send("Emulation.setEmulatedMedia", { features: [] });
  }

  await expect
    .poll(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    .toBe(false);
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

test("keeps the focused header's own inset ring visible on every edge, even under the updating bar", async () => {
  const screen = await render(
    <div style={{ marginTop: "40px", marginLeft: "40px", width: "300px", background: "white" }}>
      <Table
        {...commonProps}
        columns={sortableColumns}
        sort={{ column: "stock", direction: "descending" }}
        onSortChange={() => {}}
        loading="updating"
      />
    </div>,
  );
  await settleScroll();
  const button = screen.getByRole("button", { name: "Producto" }).element() as HTMLElement;
  await userEvent.tab();
  await settleScroll();

  const rect = button.getBoundingClientRect();
  const ringColor = rgbTuple(tokenRgb("brand-blue-strong"));
  const midX = rect.left + rect.width / 2;
  const midY = rect.top + rect.height / 2;

  const top = await pixelAt(midX, rect.top + 1);
  const left = await pixelAt(rect.left + 1, midY);
  const right = await pixelAt(rect.right - 1, midY);
  const bottom = await pixelAt(midX, rect.bottom - 1);

  expect(top.slice(0, 3)).toEqual(ringColor);
  expect(left.slice(0, 3)).toEqual(ringColor);
  expect(right.slice(0, 3)).toEqual(ringColor);
  expect(bottom.slice(0, 3)).toEqual(ringColor);

  await expectNoAccessibilityViolations(screen.container);
});

test("contains the focused header's own z-20 inside the table, instead of letting it escape past a caller's own positioned sibling", async () => {
  const toolbarColor: [number, number, number] = [255, 0, 255];
  const screen = await render(
    <div style={{ position: "relative", marginTop: "40px", marginLeft: "40px", width: "300px" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 15,
          background: `rgb(${toolbarColor.join(", ")})`,
        }}
      />
      <Table
        {...commonProps}
        columns={sortableColumns}
        sort={{ column: "stock", direction: "descending" }}
        onSortChange={() => {}}
      />
    </div>,
  );
  await settleScroll();
  const button = screen.getByRole("button", { name: "Producto" }).element() as HTMLElement;
  await userEvent.tab();
  await settleScroll();

  expect(button.getAttribute("data-focus-visible")).toBe("true");

  const rect = button.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;

  // 1.5px stays clear of the corner's own rounding and antialiasing blend.
  const ring = await pixelAt(rect.left + 1.5, midY);

  expect(ring.slice(0, 3)).toEqual(toolbarColor);

  await expectNoAccessibilityViolations(screen.container);
});

test("reads the focused header's own ring color at the same probe point when the toolbar sits behind everything", async () => {
  const screen = await render(
    <div style={{ position: "relative", marginTop: "40px", marginLeft: "40px", width: "300px" }}>
      <div style={{ position: "absolute", inset: 0, zIndex: -1, background: "rgb(255, 0, 255)" }} />
      <Table
        {...commonProps}
        columns={sortableColumns}
        sort={{ column: "stock", direction: "descending" }}
        onSortChange={() => {}}
      />
    </div>,
  );
  await settleScroll();
  const button = screen.getByRole("button", { name: "Producto" }).element() as HTMLElement;
  await userEvent.tab();
  await settleScroll();

  expect(button.getAttribute("data-focus-visible")).toBe("true");

  const rect = button.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const ring = await pixelAt(rect.left + 1.5, midY);

  expect(ring.slice(0, 3)).toEqual(rgbTuple(tokenRgb("brand-blue-strong")));

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
});

test("slides the updating bar's segment exactly from off the left edge to off the right edge, with no dead time", async () => {
  // Fixed width, since the table is w-full and would otherwise tie the bar's width to the runner's viewport.
  const screen = await render(
    <div style={{ width: "300px" }}>
      <Table {...commonProps} columns={columns} loading="updating" />
    </div>,
  );
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

  // 1ms short: at the exact duration, an infinite iteration count resolves to the next start.
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

  // This file's tests share one browser tab, so a leftover override would carry into the next test.
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
  expect(icon.closest('[aria-hidden="true"]')).not.toBeNull();
  expect(screen.container.querySelector("table")).toBeNull();
  const section = screen.container.querySelector("section") as HTMLElement;
  expect(section.hasAttribute("aria-busy")).toBe(false);
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
});

test("renders only the title under the icon when the empty state has no detail", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={columns}
      rows={emptyRows}
      empty={{ icon: <PackageSearch />, title: "No archived products", tone: "filtered" }}
    />,
  );

  const title = screen.getByText("No archived products");
  await expect.element(title).toBeVisible();
  expect(title.element().parentElement?.querySelectorAll("p")).toHaveLength(1);
});

test("renders the real rows, not the empty state, when both rows and an empty prop are given", async () => {
  const screen = await render(
    <Table
      {...commonProps}
      columns={columns}
      empty={{
        icon: <PackageSearch />,
        title: "No products yet",
        detail: "Add your first product to see it here.",
        tone: "blank",
      }}
    />,
  );

  await expect.element(screen.getByRole("cell", { name: "Coffee" })).toBeVisible();
  expect(screen.getByText("No products yet").query()).toBeNull();
  expect(screen.container.querySelector("table")).not.toBeNull();
  expect(screen.container.querySelector("section")).toBeNull();
});

// document.body is the browser's own standard fallback when a focused element is removed.
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
});

test("keeps showing the footer while updating", async () => {
  const screen = await render(
    <Table {...commonProps} columns={columns} loading="updating" footer={<p>1-2 of 2</p>} />,
  );

  await expect.element(screen.getByText("1-2 of 2")).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

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
    TableProps<Product, typeof columns>
  >();
  expectTypeOf<{ "aria-label": string; rows: TableRow<Product>[] }>().not.toExtend<
    TableProps<Product, typeof columns>
  >();
  expectTypeOf<{ "aria-label": string; columns: typeof columns }>().not.toExtend<
    TableProps<Product, typeof columns>
  >();
});
