import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import type { SummaryRowProps } from "./summary-row";
import { SummaryRowGroup, type SummaryRowGroupProps } from "./summary-row-group";

test("stacks rows 8px apart, with a 1px line above and below the group and 16px vertical padding", async () => {
  const screen = await render(
    <SummaryRowGroup
      rows={[
        { label: "Items", value: "3" },
        { label: "Subtotal", value: "$120.00" },
      ]}
    />,
  );
  const group = screen.container.firstElementChild as HTMLElement;
  const style = getComputedStyle(group);

  expect(style.rowGap).toBe("8px");

  const [firstRow, secondRow] = Array.from(group.children) as [HTMLElement, HTMLElement];
  const firstRect = firstRow.getBoundingClientRect();
  const secondRect = secondRow.getBoundingClientRect();
  const gap = secondRect.top - firstRect.bottom;

  expect(gap).toBeGreaterThan(7);
  expect(gap).toBeLessThan(9);
  expect(secondRect.left).toBeCloseTo(firstRect.left, 0);

  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderBottomWidth).toBe("1px");
  expect(style.borderTopColor).toBe(tokenRgb("border"));
  expect(style.borderBottomColor).toBe(tokenRgb("border"));
  expect(style.borderLeftWidth).toBe("0px");
  expect(style.borderRightWidth).toBe("0px");
  expect(style.paddingTop).toBe("16px");
  expect(style.paddingBottom).toBe("16px");

  await expectNoAccessibilityViolations(screen.container);
});

test("draws the filled form as a subtle card with 8px corners, no lines, 12px by 16px padding and rows 6px apart", async () => {
  const screen = await render(
    <SummaryRowGroup
      variant="filled"
      rows={[
        { label: "List price", value: "$84.00", detail: true },
        { label: "Discount", value: "− $8.40", detail: true, tone: "error" },
      ]}
    />,
  );
  const group = screen.container.firstElementChild as HTMLElement;
  const style = getComputedStyle(group);

  expect(style.backgroundColor).toBe(tokenRgb("surface-subtle"));
  expect(style.borderRadius).toBe("8px");
  expect(style.borderTopWidth).toBe("0px");
  expect(style.borderBottomWidth).toBe("0px");
  expect(style.borderLeftWidth).toBe("0px");
  expect(style.borderRightWidth).toBe("0px");
  expect(style.paddingTop).toBe("12px");
  expect(style.paddingBottom).toBe("12px");
  expect(style.paddingLeft).toBe("16px");
  expect(style.paddingRight).toBe("16px");

  const [firstRow, secondRow] = Array.from(group.children) as [HTMLElement, HTMLElement];
  const gap = secondRow.getBoundingClientRect().top - firstRow.getBoundingClientRect().bottom;
  expect(gap).toBeGreaterThan(5);
  expect(gap).toBeLessThan(7);

  await expectNoAccessibilityViolations(screen.container);
});

test("draws the divided form when given it by name, the same as by default", async () => {
  const rows = [{ label: "Items", value: "3" }] as const;
  const screen = await render(
    <>
      <SummaryRowGroup rows={rows} />
      <SummaryRowGroup variant="divided" rows={rows} />
    </>,
  );
  const [byDefault, byName] = Array.from(screen.container.children) as [HTMLElement, HTMLElement];

  expect(byName.className).toBe(byDefault.className);
});

test("draws no divider on the rows themselves, only one line above and below the whole group", async () => {
  const screen = await render(
    <SummaryRowGroup
      rows={[
        { label: "Items", value: "3" },
        { label: "Subtotal", value: "$120.00" },
        { label: "Total", value: "$130.00", strong: true },
      ]}
    />,
  );
  const group = screen.container.firstElementChild as HTMLElement;

  expect(group.children).toHaveLength(3);
  for (const row of Array.from(group.children)) {
    const style = getComputedStyle(row as HTMLElement);
    expect(style.borderTopWidth).toBe("0px");
    expect(style.borderBottomWidth).toBe("0px");
  }
});

test("renders every row it is given, in order", async () => {
  const screen = await render(
    <SummaryRowGroup
      rows={[
        { label: "Items", value: "3" },
        { label: "Subtotal", value: "$120.00" },
        { label: "Total", value: "$130.00", strong: true },
      ]}
    />,
  );

  await expect.element(screen.getByText("Items", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Subtotal", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Total", { exact: true })).toBeVisible();

  const group = screen.container.firstElementChild as HTMLElement;
  expect(group.children[0]?.textContent).toBe("Items3");
  expect(group.children[2]?.textContent).toBe("Total$130.00");
});

test("renders a row it is given as strong or as a saving, not in the plain form", async () => {
  const screen = await render(
    <SummaryRowGroup
      rows={[
        { label: "Discount", value: "-$10.00", saving: true },
        { label: "Total", value: "$130.00", strong: true },
      ]}
    />,
  );
  const savingValue = screen.getByText("-$10.00", { exact: true }).element() as HTMLElement;
  const strongLabel = screen.getByText("Total", { exact: true }).element() as HTMLElement;
  const strongValue = screen.getByText("$130.00", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(savingValue).color).toBe(tokenRgb("success"));

  expect(getComputedStyle(strongLabel).fontSize).toBe("18px");
  expect(getComputedStyle(strongLabel).fontWeight).toBe("700");
  expect(getComputedStyle(strongLabel).color).toBe(tokenRgb("text"));
  expect(getComputedStyle(strongValue).fontSize).toBe("18px");
  expect(getComputedStyle(strongValue).fontWeight).toBe("700");
  expect(getComputedStyle(strongValue).color).toBe(tokenRgb("text"));

  await expectNoAccessibilityViolations(screen.container);
});

test("renders a row it is given with an error or an info tone in that tone", async () => {
  const screen = await render(
    <SummaryRowGroup
      rows={[
        { label: "Discount", value: "− $10.00", tone: "error" },
        { label: "Line total", value: "$90.00", strong: true, tone: "info" },
      ]}
    />,
  );
  const errorValue = screen.getByText("− $10.00", { exact: true }).element() as HTMLElement;
  const infoValue = screen.getByText("$90.00", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(errorValue).color).toBe(tokenRgb("error-strong"));
  expect(getComputedStyle(infoValue).color).toBe(tokenRgb("info-strong"));
  expect(getComputedStyle(infoValue).fontSize).toBe("20px");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders a row it is given as a detail in the detail form", async () => {
  const screen = await render(
    <SummaryRowGroup rows={[{ label: "List price", value: "$84.00", detail: true }]} />,
  );
  const label = screen.getByText("List price", { exact: true }).element() as HTMLElement;
  const value = screen.getByText("$84.00", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(label).fontSize).toBe("14px");
  expect(getComputedStyle(value).fontWeight).toBe("400");
});

test("does not accept a group without rows to hold", () => {
  expectTypeOf<Record<string, never>>().not.toExtend<SummaryRowGroupProps>();
  expectTypeOf<{ rows: undefined }>().not.toExtend<SummaryRowGroupProps>();
});

test("does not accept an empty rows list, or one TypeScript cannot prove is non-empty", () => {
  expectTypeOf<{ rows: [] }>().not.toExtend<SummaryRowGroupProps>();
  expectTypeOf<{ rows: SummaryRowProps[] }>().not.toExtend<SummaryRowGroupProps>();
  expectTypeOf<{ rows: readonly SummaryRowProps[] }>().not.toExtend<SummaryRowGroupProps>();
});

test("does not accept a form other than divided or filled", () => {
  expectTypeOf<{
    rows: [SummaryRowProps];
    variant: "outlined";
  }>().not.toExtend<SummaryRowGroupProps>();
});
