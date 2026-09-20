import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import { SummaryRow } from "./SummaryRow";
import { SummaryRowGroup, type SummaryRowGroupProps } from "./SummaryRowGroup";

test("draws a 1px line above and below the group, with 16px vertical padding", async () => {
  const screen = await render(
    <SummaryRowGroup>
      <SummaryRow label="Items" value="3" />
      <SummaryRow label="Subtotal" value="$120.00" />
    </SummaryRowGroup>,
  );
  const group = screen.container.firstElementChild as HTMLElement;
  const style = getComputedStyle(group);

  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderBottomWidth).toBe("1px");
  expect(style.borderTopColor).toBe(tokenRgb("line"));
  expect(style.borderBottomColor).toBe(tokenRgb("line"));
  expect(style.paddingTop).toBe("16px");
  expect(style.paddingBottom).toBe("16px");

  await expectNoAccessibilityViolations(screen.container);
});

test("draws no divider on the rows themselves, only one line above and below the whole group", async () => {
  const screen = await render(
    <SummaryRowGroup>
      <SummaryRow label="Items" value="3" />
      <SummaryRow label="Subtotal" value="$120.00" />
      <SummaryRow label="Total" value="$130.00" strong />
    </SummaryRowGroup>,
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
    <SummaryRowGroup>
      <SummaryRow label="Items" value="3" />
      <SummaryRow label="Subtotal" value="$120.00" />
      <SummaryRow label="Total" value="$130.00" strong />
    </SummaryRowGroup>,
  );

  await expect.element(screen.getByText("Items")).toBeVisible();
  await expect.element(screen.getByText("Subtotal")).toBeVisible();
  await expect.element(screen.getByText("Total")).toBeVisible();

  const group = screen.container.firstElementChild as HTMLElement;
  expect(group.children[0]?.textContent).toBe("Items3");
  expect(group.children[2]?.textContent).toBe("Total$130.00");

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a group without rows to hold", () => {
  expectTypeOf<Record<string, never>>().not.toExtend<SummaryRowGroupProps>();
});
