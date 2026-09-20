import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import type { SummaryRowProps } from "./SummaryRow";
import { SummaryRowGroup, type SummaryRowGroupProps } from "./SummaryRowGroup";

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
  expect(style.borderTopColor).toBe(tokenRgb("line"));
  expect(style.borderBottomColor).toBe(tokenRgb("line"));
  expect(style.borderLeftWidth).toBe("0px");
  expect(style.borderRightWidth).toBe("0px");
  expect(style.paddingTop).toBe("16px");
  expect(style.paddingBottom).toBe("16px");

  await expectNoAccessibilityViolations(screen.container);
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

  await expectNoAccessibilityViolations(screen.container);
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

  await expectNoAccessibilityViolations(screen.container);
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

  expect(getComputedStyle(savingValue).color).toBe(tokenRgb("brand-green-ui"));

  expect(getComputedStyle(strongLabel).fontSize).toBe("18px");
  expect(getComputedStyle(strongLabel).fontWeight).toBe("700");
  expect(getComputedStyle(strongLabel).color).toBe(tokenRgb("ink"));
  expect(getComputedStyle(strongValue).fontSize).toBe("18px");
  expect(getComputedStyle(strongValue).fontWeight).toBe("700");
  expect(getComputedStyle(strongValue).color).toBe(tokenRgb("ink"));

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a group without rows to hold", () => {
  expectTypeOf<Record<string, never>>().not.toExtend<SummaryRowGroupProps>();
  expectTypeOf<{ rows: undefined }>().not.toExtend<SummaryRowGroupProps>();
});

// A group with nothing to frame would draw two rules around empty space, so it is ruled out where
// the caller writes it instead of where the component paints: an empty list fails to compile, and
// so does the plain array a `rows.map(...)` call site produces, which TypeScript cannot prove
// holds at least one row.
test("does not accept an empty rows list, or one TypeScript cannot prove is non-empty", () => {
  expectTypeOf<{ rows: [] }>().not.toExtend<SummaryRowGroupProps>();
  expectTypeOf<{ rows: SummaryRowProps[] }>().not.toExtend<SummaryRowGroupProps>();
  expectTypeOf<{ rows: readonly SummaryRowProps[] }>().not.toExtend<SummaryRowGroupProps>();
});
