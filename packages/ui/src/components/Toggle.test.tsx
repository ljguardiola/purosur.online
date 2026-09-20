import { useState } from "react";
import { expect, expectTypeOf, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import { Toggle, type ToggleProps } from "./Toggle";

type Screen = Awaited<ReturnType<typeof render>>;

// Mirrors Checkbox.test.tsx's checkboxInput/checkboxLabel/checkboxBox split: the accessible
// "switch" role resolves to react-aria's visually hidden native <input>, while the visible track
// and the pointer target both live on the <label> that wraps it.
function toggleInput(screen: Screen, name: string): HTMLInputElement {
  return screen.getByRole("switch", { name }).element() as HTMLInputElement;
}

function toggleLabel(screen: Screen, name: string): HTMLElement {
  return toggleInput(screen, name).closest("label") as HTMLElement;
}

// React Aria's Switch renders a visually hidden wrapper around the native <input> as the
// label's first child, our own track as its second, and the caller's content after that.
function toggleTrack(screen: Screen, name: string): HTMLElement {
  return toggleLabel(screen, name).children[1] as HTMLElement;
}

function toggleKnob(screen: Screen, name: string): HTMLElement {
  return toggleTrack(screen, name).children[0] as HTMLElement;
}

function Harness({ initial = false }: { initial?: boolean }) {
  const [isOn, setIsOn] = useState(initial);
  return (
    <Toggle isSelected={isOn} onChange={setIsOn}>
      Apply discount
    </Toggle>
  );
}

test("renders the caller's content 12px from a 48x28px, 14px-radius track, vertically centered", async () => {
  const screen = await render(
    <Toggle isSelected={false} onChange={() => {}}>
      Apply discount
    </Toggle>,
  );
  const label = toggleLabel(screen, "Apply discount");
  const track = toggleTrack(screen, "Apply discount");
  const trackRect = track.getBoundingClientRect();

  expect(trackRect.width).toBeGreaterThan(47);
  expect(trackRect.width).toBeLessThan(49);
  expect(trackRect.height).toBeGreaterThan(27);
  expect(trackRect.height).toBeLessThan(29);
  expect(getComputedStyle(track).borderRadius).toBe("14px");
  expect(getComputedStyle(label).alignItems).toBe("center");

  const content = screen.getByText("Apply discount").element() as HTMLElement;
  const gap = content.getBoundingClientRect().left - trackRect.right;
  expect(gap).toBeGreaterThan(11);
  expect(gap).toBeLessThan(13);

  await expectNoAccessibilityViolations(screen.container);
});

test("colors an off track white with a 2px ink-secondary border and a white knob at the near end", async () => {
  const screen = await render(
    <Toggle isSelected={false} onChange={() => {}}>
      Apply discount
    </Toggle>,
  );
  const track = toggleTrack(screen, "Apply discount");
  const knob = toggleKnob(screen, "Apply discount");
  const trackRect = track.getBoundingClientRect();
  const knobRect = knob.getBoundingClientRect();

  expect(getComputedStyle(track).backgroundColor).toBe(tokenRgb("surface-white"));
  expect(getComputedStyle(track).boxShadow).toContain(tokenRgb("ink-secondary"));
  expect(getComputedStyle(track).boxShadow).toContain("2px");
  expect(getComputedStyle(knob).backgroundColor).toBe(tokenRgb("surface-white"));

  // "Near end" for an off toggle is the left edge: the knob sits flush against the track's own
  // 4px padding on the left, with the remaining travel distance open on the right.
  expect(knobRect.left - trackRect.left).toBeCloseTo(4, 0);
  expect(trackRect.right - knobRect.right).toBeGreaterThan(10);

  await expectNoAccessibilityViolations(screen.container);
});

test("turns an off track's background bone on hover, keeping its border", async () => {
  const screen = await render(
    <Toggle isSelected={false} onChange={() => {}}>
      Apply discount
    </Toggle>,
  );
  const label = toggleLabel(screen, "Apply discount");
  const track = toggleTrack(screen, "Apply discount");

  await userEvent.hover(label);
  await expect.poll(() => getComputedStyle(track).backgroundColor).toBe(tokenRgb("surface-bone"));
  expect(getComputedStyle(track).boxShadow).toContain(tokenRgb("ink-secondary"));

  await expectNoAccessibilityViolations(screen.container);
});

test("colors an on track green UI with no border and a white knob at the far end", async () => {
  const screen = await render(
    <Toggle isSelected onChange={() => {}}>
      Apply discount
    </Toggle>,
  );
  const track = toggleTrack(screen, "Apply discount");
  const knob = toggleKnob(screen, "Apply discount");
  const trackRect = track.getBoundingClientRect();
  const knobRect = knob.getBoundingClientRect();

  expect(getComputedStyle(track).backgroundColor).toBe(tokenRgb("brand-green-ui"));
  expect(getComputedStyle(track).boxShadow).not.toContain(tokenRgb("ink-secondary"));
  expect(getComputedStyle(knob).backgroundColor).toBe(tokenRgb("surface-white"));

  // "Far end" for an on toggle is the right edge: the knob sits flush against the track's own
  // 4px padding on the right.
  expect(trackRect.right - knobRect.right).toBeCloseTo(4, 0);
  expect(knobRect.left - trackRect.left).toBeGreaterThan(10);

  await expectNoAccessibilityViolations(screen.container);
});

test("turns an on track's background green strong on hover, keeping the white knob", async () => {
  const screen = await render(
    <Toggle isSelected onChange={() => {}}>
      Apply discount
    </Toggle>,
  );
  const label = toggleLabel(screen, "Apply discount");
  const track = toggleTrack(screen, "Apply discount");
  const knob = toggleKnob(screen, "Apply discount");

  await userEvent.hover(label);
  await expect
    .poll(() => getComputedStyle(track).backgroundColor)
    .toBe(tokenRgb("brand-green-strong"));
  expect(getComputedStyle(knob).backgroundColor).toBe(tokenRgb("surface-white"));

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the track's size stable between the off and on states", async () => {
  const offScreen = await render(
    <Toggle isSelected={false} onChange={() => {}}>
      Apply discount
    </Toggle>,
  );
  const offRect = toggleTrack(offScreen, "Apply discount").getBoundingClientRect();
  await offScreen.unmount();

  const onScreen = await render(
    <Toggle isSelected onChange={() => {}}>
      Apply discount
    </Toggle>,
  );
  const onRect = toggleTrack(onScreen, "Apply discount").getBoundingClientRect();

  expect(onRect.width).toBeCloseTo(offRect.width, 0);
  expect(onRect.height).toBeCloseTo(offRect.height, 0);

  await expectNoAccessibilityViolations(onScreen.container);
});

test("toggles when clicking the track", async () => {
  const screen = await render(<Harness />);

  await userEvent.click(toggleTrack(screen, "Apply discount"));

  expect(toggleInput(screen, "Apply discount").checked).toBe(true);
  await expectNoAccessibilityViolations(screen.container);
});

test("toggles when clicking the content", async () => {
  const screen = await render(<Harness />);

  await userEvent.click(screen.getByText("Apply discount").element());

  expect(toggleInput(screen, "Apply discount").checked).toBe(true);
  await expectNoAccessibilityViolations(screen.container);
});

test("toggles with Space when focused", async () => {
  const screen = await render(<Harness />);

  await userEvent.tab();
  await userEvent.keyboard(" ");

  expect(toggleInput(screen, "Apply discount").checked).toBe(true);
  await expectNoAccessibilityViolations(screen.container);
});

test("exposes the toggle to assistive technology as a switch named by its content, with its on/off state", async () => {
  const offScreen = await render(
    <Toggle isSelected={false} onChange={() => {}}>
      Apply discount
    </Toggle>,
  );
  await expect.element(offScreen.getByRole("switch", { name: "Apply discount" })).not.toBeChecked();
  await offScreen.unmount();

  const onScreen = await render(
    <Toggle isSelected onChange={() => {}}>
      Apply discount
    </Toggle>,
  );
  await expect.element(onScreen.getByRole("switch", { name: "Apply discount" })).toBeChecked();

  await expectNoAccessibilityViolations(onScreen.container);
});

test("shows the package's focus ring around the track when focused", async () => {
  const screen = await render(
    <Toggle isSelected={false} onChange={() => {}}>
      Apply discount
    </Toggle>,
  );
  const track = toggleTrack(screen, "Apply discount");

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(track).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(track).outlineOffset).toBe("3px");
  await expect.poll(() => getComputedStyle(track).outlineColor).toBe(tokenRgb("brand-blue-strong"));

  await expectNoAccessibilityViolations(screen.container);
});

test("dims the whole toggle to 45% opacity and blocks focus when disabled", async () => {
  const screen = await render(
    <>
      <Toggle isSelected={false} onChange={() => {}} disabled>
        Apply discount
      </Toggle>
      <button type="button">Siguiente control</button>
    </>,
  );
  const label = toggleLabel(screen, "Apply discount");
  const input = toggleInput(screen, "Apply discount");
  const nextControl = screen.getByRole("button", { name: "Siguiente control" }).element();

  expect(getComputedStyle(label).opacity).toBe("0.45");
  expect(input.disabled).toBe(true);

  await userEvent.tab();
  expect(document.activeElement).toBe(nextControl);
  expect(document.activeElement).not.toBe(input);

  await expectNoAccessibilityViolations(screen.container);
});

// See Button.test.tsx's icon/label tests for the same "does not compile" pattern: the caller's
// input is checked at the type level, not just at runtime.
test("does not accept a toggle without content", () => {
  expectTypeOf<{
    isSelected: boolean;
    onChange: (isSelected: boolean) => void;
  }>().not.toExtend<ToggleProps>();
});

test("does not accept a toggle without isSelected or onChange", () => {
  expectTypeOf<{
    onChange: (isSelected: boolean) => void;
    children: string;
  }>().not.toExtend<ToggleProps>();
  expectTypeOf<{ isSelected: boolean; children: string }>().not.toExtend<ToggleProps>();
});
