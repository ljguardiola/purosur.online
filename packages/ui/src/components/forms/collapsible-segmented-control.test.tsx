import { useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import {
  CollapsibleSegmentedControl,
  type CollapsibleSegmentedControlProps,
} from "./collapsible-segmented-control";
import type { Option } from "./option";

type Period = "day" | "week" | "month" | "quarter";

const options: [Option<Period>, ...Option<Period>[]] = [
  { value: "day", label: "By day" },
  { value: "week", label: "By week" },
  { value: "month", label: "By month" },
  { value: "quarter", label: "By quarter" },
];

const WIDE_AREA = 900;
const NARROW_AREA = 200;

function Area({
  width,
  onChange = () => {},
}: {
  width: number;
  onChange?: (value: Period) => void;
}) {
  const [value, setValue] = useState<Period>("day");
  return (
    <div data-testid="area" style={{ width: `${width}px` }}>
      <CollapsibleSegmentedControl<Period>
        name="period"
        label="Period"
        options={options}
        value={value}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
    </div>
  );
}

test("shows the segmented control when its options fit the width it has", async () => {
  const screen = await render(<Area width={WIDE_AREA} />);

  await expect.element(screen.getByRole("radiogroup", { name: "Period" })).toBeVisible();
  expect(screen.getByRole("radiogroup").elements()).toHaveLength(1);
  expect(screen.getByRole("button", { name: "By day Period" }).query()).toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("replaces the segmented control with a select named by the same label when its options do not fit", async () => {
  const screen = await render(<Area width={NARROW_AREA} />);

  await expect.element(screen.getByRole("button", { name: "By day Period" })).toBeVisible();
  expect(screen.getByRole("radiogroup").elements()).toHaveLength(0);
  expect(screen.getByRole("radio").elements()).toHaveLength(0);
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the select inside the width it has", async () => {
  const screen = await render(<Area width={NARROW_AREA} />);
  const trigger = screen.getByRole("button", { name: "By day Period" });
  await expect.element(trigger).toBeVisible();
  const area = screen.getByTestId("area").element();

  expect(trigger.element().getBoundingClientRect().right).toBeLessThanOrEqual(
    area.getBoundingClientRect().right,
  );
});

test("reports the option chosen from the select", async () => {
  const onChange = vi.fn();
  const screen = await render(<Area width={NARROW_AREA} onChange={onChange} />);

  await userEvent.click(screen.getByRole("button", { name: "By day Period" }));
  await userEvent.click(screen.getByRole("option", { name: "By month" }));

  expect(onChange).toHaveBeenLastCalledWith("month");
  await expect.element(screen.getByRole("button", { name: "By month Period" })).toBeVisible();
});

test("switches between the segmented control and the select as its area is resized", async () => {
  const screen = await render(<Area width={WIDE_AREA} />);
  const area = screen.getByTestId("area").element() as HTMLElement;
  await expect.element(screen.getByRole("radiogroup", { name: "Period" })).toBeVisible();

  area.style.width = `${NARROW_AREA}px`;
  await expect.element(screen.getByRole("button", { name: "By day Period" })).toBeVisible();
  expect(screen.getByRole("radiogroup").elements()).toHaveLength(0);

  area.style.width = `${WIDE_AREA}px`;
  await expect.element(screen.getByRole("radiogroup", { name: "Period" })).toBeVisible();
  expect(screen.getByRole("button", { name: "By day Period" }).query()).toBeNull();
});

test("does not accept a control without the name its select is submitted with", () => {
  expectTypeOf<{
    label: string;
    options: typeof options;
    value: Period;
    onChange: (value: Period) => void;
  }>().not.toExtend<CollapsibleSegmentedControlProps<Period>>();
});
