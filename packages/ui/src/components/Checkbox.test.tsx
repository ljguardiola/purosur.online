import type { ReactNode } from "react";
import { useState } from "react";
import { expect, expectTypeOf, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import { Checkbox, type CheckboxProps } from "./Checkbox";

type Screen = Awaited<ReturnType<typeof render>>;

// Mirrors OptionCardGroup.test.tsx's radioInput/radioCard split: the accessible "checkbox" role
// resolves to react-aria's visually hidden native <input>, while the visible box and the pointer
// target both live on the <label> that wraps it.
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
    <Checkbox isSelected={checked} onChange={setChecked}>
      <span>Return this line</span>
    </Checkbox>
  );
}

test("renders the caller's content 12px from a 22px, 4px-radius box, vertically centered", async () => {
  // Wrapped in its own element so its rect can be measured on its own: raw text with no wrapping
  // element would make `getByText` resolve to the label (its only element with that text), not to
  // the content itself.
  const screen = await render(
    <Checkbox isSelected={false} onChange={() => {}}>
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

  await expectNoAccessibilityViolations(screen.container);
});

test("colors an unchecked box white with a 2px ink-secondary border and no check", async () => {
  const screen = await render(
    <Checkbox isSelected={false} onChange={() => {}}>
      Return this line
    </Checkbox>,
  );
  const box = checkboxBox(screen, "Return this line");
  const style = getComputedStyle(box);

  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.boxShadow).toContain(tokenRgb("ink-secondary"));
  expect(style.boxShadow).toContain("2px");
  expect(box.querySelector("svg")).toBeNull();

  await expectNoAccessibilityViolations(screen.container);
});

test("turns an unchecked box's background bone on hover, keeping its border", async () => {
  const screen = await render(
    <Checkbox isSelected={false} onChange={() => {}}>
      Return this line
    </Checkbox>,
  );
  const label = checkboxLabel(screen, "Return this line");
  const box = checkboxBox(screen, "Return this line");

  await userEvent.hover(label);
  await expect.poll(() => getComputedStyle(box).backgroundColor).toBe(tokenRgb("surface-bone"));
  expect(getComputedStyle(box).boxShadow).toContain(tokenRgb("ink-secondary"));

  // Leaves the real pointer away from where the next test's box will render: every test in this
  // file renders its checkbox at the same page position, so a hover left unresolved here would
  // otherwise carry over and falsely hover the next test's fresh box.
  await userEvent.unhover(label);
  await expectNoAccessibilityViolations(screen.container);
});

test("colors a checked box blue UI with a 16px white check and no border", async () => {
  const screen = await render(
    <Checkbox isSelected onChange={() => {}}>
      Return this line
    </Checkbox>,
  );
  const box = checkboxBox(screen, "Return this line");
  const style = getComputedStyle(box);
  const check = box.querySelector("svg") as SVGSVGElement;

  expect(style.backgroundColor).toBe(tokenRgb("brand-blue-ui"));
  expect(style.boxShadow).not.toContain(tokenRgb("ink-secondary"));
  expect(check).not.toBeNull();

  const checkRect = check.getBoundingClientRect();
  expect(checkRect.width).toBeGreaterThan(15);
  expect(checkRect.width).toBeLessThan(17);
  expect(checkRect.height).toBeGreaterThan(15);
  expect(checkRect.height).toBeLessThan(17);
  expect(getComputedStyle(check).color).toBe(tokenRgb("surface-white"));

  await expectNoAccessibilityViolations(screen.container);
});

test("turns a checked box's background blue strong on hover, keeping the white check", async () => {
  const screen = await render(
    <Checkbox isSelected onChange={() => {}}>
      Return this line
    </Checkbox>,
  );
  const label = checkboxLabel(screen, "Return this line");
  const box = checkboxBox(screen, "Return this line");

  await userEvent.hover(label);
  await expect
    .poll(() => getComputedStyle(box).backgroundColor)
    .toBe(tokenRgb("brand-blue-strong"));
  expect(box.querySelector("svg")).not.toBeNull();

  // See the unchecked-hover test above: leaves the pointer away from the next test's box.
  await userEvent.unhover(label);
  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the box's size stable between the unchecked and checked states", async () => {
  const uncheckedScreen = await render(
    <Checkbox isSelected={false} onChange={() => {}}>
      Return this line
    </Checkbox>,
  );
  const uncheckedRect = checkboxBox(uncheckedScreen, "Return this line").getBoundingClientRect();
  await uncheckedScreen.unmount();

  const checkedScreen = await render(
    <Checkbox isSelected onChange={() => {}}>
      Return this line
    </Checkbox>,
  );
  const checkedRect = checkboxBox(checkedScreen, "Return this line").getBoundingClientRect();

  expect(checkedRect.width).toBeCloseTo(uncheckedRect.width, 0);
  expect(checkedRect.height).toBeCloseTo(uncheckedRect.height, 0);

  await expectNoAccessibilityViolations(checkedScreen.container);
});

test("toggles when clicking the box", async () => {
  const screen = await render(<Harness />);

  await userEvent.click(checkboxBox(screen, "Return this line"));

  expect(checkboxInput(screen, "Return this line").checked).toBe(true);
  await expectNoAccessibilityViolations(screen.container);
});

test("toggles when clicking the content", async () => {
  const screen = await render(<Harness />);

  await userEvent.click(screen.getByText("Return this line").element());

  expect(checkboxInput(screen, "Return this line").checked).toBe(true);
  await expectNoAccessibilityViolations(screen.container);
});

test("toggles with Space when focused", async () => {
  const screen = await render(<Harness />);

  await userEvent.tab();
  await userEvent.keyboard(" ");

  expect(checkboxInput(screen, "Return this line").checked).toBe(true);
  await expectNoAccessibilityViolations(screen.container);
});

test("exposes the checkbox to assistive technology named by its content, with its checked state", async () => {
  const screen = await render(
    <Checkbox isSelected onChange={() => {}}>
      Return this line
    </Checkbox>,
  );
  const checkbox = screen.getByRole("checkbox", { name: "Return this line" });

  await expect.element(checkbox).toBeChecked();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the package's focus ring around the box when focused", async () => {
  const screen = await render(
    <Checkbox isSelected={false} onChange={() => {}}>
      Return this line
    </Checkbox>,
  );
  const box = checkboxBox(screen, "Return this line");

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(box).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(box).outlineOffset).toBe("3px");
  await expect.poll(() => getComputedStyle(box).outlineColor).toBe(tokenRgb("brand-blue-strong"));

  await expectNoAccessibilityViolations(screen.container);
});

test("lets its content fill the remaining width of a wide container", async () => {
  const screen = await render(
    <div style={{ width: "400px" }}>
      <Checkbox isSelected={false} onChange={() => {}}>
        <span>Return this line</span>
      </Checkbox>
    </div>,
  );
  const label = checkboxLabel(screen, "Return this line");
  // The label's last child is the wrapper this component puts around the caller's content (see
  // Checkbox.tsx), not the caller's own <span>: it's the element the design expects to stretch.
  const contentWrapper = label.lastElementChild as HTMLElement;

  const labelRect = label.getBoundingClientRect();
  const wrapperRect = contentWrapper.getBoundingClientRect();

  expect(labelRect.width).toBeCloseTo(400, 0);
  expect(wrapperRect.right).toBeCloseTo(labelRect.right, 0);

  await expectNoAccessibilityViolations(screen.container);
});

// See Button.test.tsx's icon/label tests for the same "does not compile" pattern: the caller's
// input is checked at the type level, not just at runtime.
test("does not accept a checkbox without content", () => {
  expectTypeOf<{
    isSelected: boolean;
    onChange: (isSelected: boolean) => void;
  }>().not.toExtend<CheckboxProps>();
});

test("does not accept a checkbox without isSelected or onChange", () => {
  expectTypeOf<{
    onChange: (isSelected: boolean) => void;
    children: ReactNode;
  }>().not.toExtend<CheckboxProps>();
  expectTypeOf<{ isSelected: boolean; children: ReactNode }>().not.toExtend<CheckboxProps>();
});

// The design has no indeterminate (or invalid, disabled, uncontrolled...) state, so unlike React
// Aria's own CheckboxProps, this component's props don't carry `isIndeterminate` at all.
test("does not accept isIndeterminate, since the design has no indeterminate state", () => {
  expectTypeOf<CheckboxProps>().not.toHaveProperty("isIndeterminate");
});
