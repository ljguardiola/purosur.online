import type { ReactNode } from "react";
import { useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { contrastRatio, NON_TEXT_CONTRAST } from "../../styles/contrast";
import { expectNoAccessibilityViolations } from "../../test/axe";
import {
  boundaryColorHex,
  insetBoundary,
  paintedBoxShadowLayers,
  rgbToHex,
  tokenRgb,
} from "../../test/token-colors";
import { Checkbox, type CheckboxProps } from "./checkbox";

type Screen = Awaited<ReturnType<typeof render>>;

// The accessible "checkbox" role resolves to react-aria's visually hidden native <input>, while
// the visible box and the pointer target both live on the <label> that wraps it.
function checkboxInput(screen: Screen, name: string): HTMLInputElement {
  return screen.getByRole("checkbox", { name }).element() as HTMLInputElement;
}

function checkboxLabel(screen: Screen, name: string): HTMLElement {
  return checkboxInput(screen, name).closest("label") as HTMLElement;
}

// React Aria's Checkbox renders a visually hidden wrapper around the native <input> as the
// label's first child, our own box as its second, and the caller's content after that.
function checkboxBox(screen: Screen, name: string): HTMLElement {
  return checkboxLabel(screen, name).children[1] as HTMLElement;
}

function Harness({ initial = false }: { initial?: boolean }) {
  const [checked, setChecked] = useState(initial);
  return (
    <Checkbox checked={checked} onCheckedChange={setChecked}>
      <span>Return this line</span>
    </Checkbox>
  );
}

test("renders the caller's content 12px from a 22px, 4px-radius box, vertically centered", async () => {
  // Wrapped in its own element: raw text has no element of its own, so getByText would resolve to
  // the label instead.
  const screen = await render(
    <Checkbox checked={false} onCheckedChange={() => {}}>
      <span>Return this line</span>
    </Checkbox>,
  );
  const label = checkboxLabel(screen, "Return this line");
  const box = checkboxBox(screen, "Return this line");
  const boxRect = box.getBoundingClientRect();

  expect(boxRect.width).toBeGreaterThan(21);
  expect(boxRect.width).toBeLessThan(23);
  expect(boxRect.height).toBeGreaterThan(21);
  expect(boxRect.height).toBeLessThan(23);
  expect(getComputedStyle(box).borderRadius).toBe("4px");
  expect(getComputedStyle(label).alignItems).toBe("center");

  const content = screen.getByText("Return this line").element() as HTMLElement;
  const gap = content.getBoundingClientRect().left - boxRect.right;
  expect(gap).toBeGreaterThan(11);
  expect(gap).toBeLessThan(13);
});

test("colors an unchecked box white with a 2px strong border and no check", async () => {
  const screen = await render(
    <Checkbox checked={false} onCheckedChange={() => {}}>
      Return this line
    </Checkbox>,
  );
  const box = checkboxBox(screen, "Return this line");
  const style = getComputedStyle(box);

  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.boxShadow).toContain(insetBoundary("border-strong", "2px"));
  expect(box.querySelector("svg")).toBeNull();

  // Checked as a rendered contrast ratio against WCAG's 3:1 non-text minimum, not by token name.
  const boundaryHex = boundaryColorHex(box);
  const fillHex = rgbToHex(style.backgroundColor);
  expect(contrastRatio(boundaryHex, fillHex)).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
});

test("turns an unchecked box's background bone on hover, keeping its border", async () => {
  const screen = await render(
    <Checkbox checked={false} onCheckedChange={() => {}}>
      Return this line
    </Checkbox>,
  );
  const label = checkboxLabel(screen, "Return this line");
  const box = checkboxBox(screen, "Return this line");

  await userEvent.hover(label);
  await expect.poll(() => getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface-subtle"));
  const style = getComputedStyle(box);
  expect(style.boxShadow).toContain(insetBoundary("border-strong", "2px"));

  const boundaryHex = boundaryColorHex(box);
  const fillHex = rgbToHex(style.backgroundColor);
  expect(contrastRatio(boundaryHex, fillHex)).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
});

test("colors a checked box blue UI with a 16px white check and no border", async () => {
  const screen = await render(
    <Checkbox checked onCheckedChange={() => {}}>
      Return this line
    </Checkbox>,
  );
  const box = checkboxBox(screen, "Return this line");
  const style = getComputedStyle(box);
  const check = box.querySelector("svg") as SVGSVGElement;

  expect(style.backgroundColor).toBe(tokenRgb("action"));
  expect(paintedBoxShadowLayers(box)).toEqual([]);
  expect(check).not.toBeNull();

  const checkRect = check.getBoundingClientRect();
  expect(checkRect.width).toBeGreaterThan(15);
  expect(checkRect.width).toBeLessThan(17);
  expect(checkRect.height).toBeGreaterThan(15);
  expect(checkRect.height).toBeLessThan(17);
  expect(getComputedStyle(check).color).toBe(tokenRgb("text-inverse"));
});

test("turns a checked box's background blue strong on hover, keeping the white check", async () => {
  const screen = await render(
    <Checkbox checked onCheckedChange={() => {}}>
      Return this line
    </Checkbox>,
  );
  const label = checkboxLabel(screen, "Return this line");
  const box = checkboxBox(screen, "Return this line");

  await userEvent.hover(label);
  await expect.poll(() => getComputedStyle(box).backgroundColor).toBe(tokenRgb("action-strong"));
  expect(box.querySelector("svg")).not.toBeNull();
});

test("keeps the box's size stable between the unchecked and checked states", async () => {
  const uncheckedScreen = await render(
    <Checkbox checked={false} onCheckedChange={() => {}}>
      Return this line
    </Checkbox>,
  );
  const uncheckedRect = checkboxBox(uncheckedScreen, "Return this line").getBoundingClientRect();
  await uncheckedScreen.unmount();

  const checkedScreen = await render(
    <Checkbox checked onCheckedChange={() => {}}>
      Return this line
    </Checkbox>,
  );
  const checkedRect = checkboxBox(checkedScreen, "Return this line").getBoundingClientRect();

  expect(checkedRect.width).toBeCloseTo(uncheckedRect.width, 0);
  expect(checkedRect.height).toBeCloseTo(uncheckedRect.height, 0);
});

test("toggles when clicking the box", async () => {
  const screen = await render(<Harness />);

  await userEvent.click(checkboxBox(screen, "Return this line"));

  expect(checkboxInput(screen, "Return this line").checked).toBe(true);
});

test("toggles when clicking the content", async () => {
  const screen = await render(<Harness />);

  await userEvent.click(screen.getByText("Return this line").element());

  expect(checkboxInput(screen, "Return this line").checked).toBe(true);
});

test("toggles with Space when focused", async () => {
  const screen = await render(<Harness />);

  await userEvent.tab();
  await userEvent.keyboard(" ");

  expect(checkboxInput(screen, "Return this line").checked).toBe(true);
});

test("exposes the checkbox to assistive technology named by its content, with its checked state", async () => {
  const screen = await render(
    <Checkbox checked onCheckedChange={() => {}}>
      Return this line
    </Checkbox>,
  );
  const checkbox = screen.getByRole("checkbox", { name: "Return this line" });

  await expect.element(checkbox).toBeChecked();
});

test("shows the package's focus ring around the box when focused", async () => {
  const screen = await render(
    <Checkbox checked={false} onCheckedChange={() => {}}>
      Return this line
    </Checkbox>,
  );
  const box = checkboxBox(screen, "Return this line");

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(box).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(box).outlineOffset).toBe("3px");
  await expect.poll(() => getComputedStyle(box).outlineColor).toBe(tokenRgb("focus"));
});

test("lets its content fill the remaining width of a wide container", async () => {
  const screen = await render(
    <div style={{ width: "400px" }}>
      <Checkbox checked={false} onCheckedChange={() => {}}>
        <span>Return this line</span>
      </Checkbox>
    </div>,
  );
  const label = checkboxLabel(screen, "Return this line");
  // The label's last child is Checkbox's own content wrapper, not the caller's <span>.
  const contentWrapper = label.lastElementChild as HTMLElement;

  const labelRect = label.getBoundingClientRect();
  const wrapperRect = contentWrapper.getBoundingClientRect();

  expect(labelRect.width).toBeCloseTo(400, 0);
  expect(wrapperRect.right).toBeCloseTo(labelRect.right, 0);
});

test("shows its description below its content, named by the content and described by the description", async () => {
  const screen = await render(
    <Checkbox checked onCheckedChange={() => {}} description="Needed by stock counts">
      <span>Return this line</span>
    </Checkbox>,
  );
  const checkbox = screen.getByRole("checkbox", { name: "Return this line" });
  const content = screen.getByText("Return this line").element() as HTMLElement;
  const description = screen.getByText("Needed by stock counts").element() as HTMLElement;

  await expect.element(checkbox).toHaveAccessibleName("Return this line");
  await expect.element(checkbox).toHaveAccessibleDescription("Needed by stock counts");
  expect(description.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    content.getBoundingClientRect().bottom,
  );
  expect(description.getBoundingClientRect().left).toBeCloseTo(
    content.getBoundingClientRect().left,
    0,
  );
  expect(getComputedStyle(description).color).toBe(tokenRgb("text-subtle"));
});

test("has no accessible description without one", async () => {
  const screen = await render(
    <Checkbox checked onCheckedChange={() => {}}>
      Return this line
    </Checkbox>,
  );

  expect(checkboxInput(screen, "Return this line").hasAttribute("aria-describedby")).toBe(false);
});

test("dims the box and content to 45% opacity when disabled, keeping its description legible", async () => {
  const screen = await render(
    <Checkbox checked onCheckedChange={() => {}} disabled description="Needed by stock counts">
      <span>Return this line</span>
    </Checkbox>,
  );
  const label = checkboxLabel(screen, "Return this line");
  const box = checkboxBox(screen, "Return this line");
  const contentWrapper = screen.getByText("Return this line").element()
    .parentElement as HTMLElement;
  const description = screen.getByText("Needed by stock counts").element() as HTMLElement;

  expect(getComputedStyle(box).opacity).toBe("0.45");
  expect(getComputedStyle(contentWrapper).opacity).toBe("0.45");
  expect(getComputedStyle(description).opacity).toBe("1");
  expect(getComputedStyle(label).opacity).toBe("1");
  expect(getComputedStyle(label).cursor).toBe("default");
});

test("neither toggles nor takes focus when disabled", async () => {
  const onCheckedChange = vi.fn();
  const screen = await render(
    <>
      <Checkbox checked onCheckedChange={onCheckedChange} disabled>
        Return this line
      </Checkbox>
      <button type="button">Next control</button>
    </>,
  );
  const input = checkboxInput(screen, "Return this line");

  await userEvent.click(checkboxLabel(screen, "Return this line"), { force: true });
  await userEvent.tab();

  expect(onCheckedChange).not.toHaveBeenCalled();
  expect(input.disabled).toBe(true);
  expect(input.checked).toBe(true);
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Next control" }).element(),
  );
});

test("has no accessibility violations when disabled with a description", async () => {
  const screen = await render(
    <Checkbox checked onCheckedChange={() => {}} disabled description="Needed by stock counts">
      Return this line
    </Checkbox>,
  );

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a checkbox without content", () => {
  expectTypeOf<{
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  }>().not.toExtend<CheckboxProps>();
});

test("does not accept a checkbox without checked or onCheckedChange", () => {
  expectTypeOf<{
    onCheckedChange: (checked: boolean) => void;
    children: ReactNode;
  }>().not.toExtend<CheckboxProps>();
  expectTypeOf<{ checked: boolean; children: ReactNode }>().not.toExtend<CheckboxProps>();
});

test("does not accept isIndeterminate, since the design has no indeterminate state", () => {
  expectTypeOf<CheckboxProps>().not.toHaveProperty("isIndeterminate");
});

test("names its state checked and reports it with onCheckedChange", () => {
  expectTypeOf<CheckboxProps>().toHaveProperty("checked");
  expectTypeOf<CheckboxProps>().toHaveProperty("onCheckedChange");
  expectTypeOf<CheckboxProps>().not.toHaveProperty("isSelected");
  expectTypeOf<CheckboxProps>().not.toHaveProperty("onChange");
});

test("names its native input with the name it is given", async () => {
  const screen = await render(
    <Checkbox name="returnLine" checked={false} onCheckedChange={() => {}}>
      <span>Return this line</span>
    </Checkbox>,
  );

  expect(checkboxInput(screen, "Return this line").getAttribute("name")).toBe("returnLine");
});
