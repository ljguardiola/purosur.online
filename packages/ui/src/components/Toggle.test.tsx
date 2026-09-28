import { useState } from "react";
import { expect, expectTypeOf, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { contrastRatio, NON_TEXT_CONTRAST } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import { expectFullyRound } from "../test/fully-round";
import {
  boundaryColorHex,
  insetBoundary,
  paintedBoxShadowLayers,
  rgbToHex,
  tokenRgb,
} from "../test/token-colors";
import { Toggle, type ToggleProps } from "./Toggle";

type Screen = Awaited<ReturnType<typeof render>>;

// The accessible "switch" role resolves to react-aria's visually hidden native <input>; the
// visible track and pointer target both live on the <label> wrapping it.
function toggleInput(screen: Screen, name: string): HTMLInputElement {
  return screen.getByRole("switch", { name }).element() as HTMLInputElement;
}

function toggleLabel(screen: Screen, name: string): HTMLElement {
  return toggleInput(screen, name).closest("label") as HTMLElement;
}

// react-aria's Switch renders a hidden input wrapper first, then the track, then the content.
function toggleTrack(screen: Screen, name: string): HTMLElement {
  return toggleLabel(screen, name).children[1] as HTMLElement;
}

function toggleKnob(screen: Screen, name: string): HTMLElement {
  return toggleTrack(screen, name).children[0] as HTMLElement;
}

function Harness() {
  const [isOn, setIsOn] = useState(false);
  return (
    <Toggle isSelected={isOn} onChange={setIsOn}>
      Apply discount
    </Toggle>
  );
}

test("renders a 22px round knob in a 48x28px, fully round track, with the content 12px away", async () => {
  const screen = await render(
    <Toggle isSelected={false} onChange={() => {}}>
      Apply discount
    </Toggle>,
  );
  const label = toggleLabel(screen, "Apply discount");
  const track = toggleTrack(screen, "Apply discount");
  const knob = toggleKnob(screen, "Apply discount");
  const trackRect = track.getBoundingClientRect();
  const knobRect = knob.getBoundingClientRect();

  expect(trackRect.width).toBeGreaterThan(47);
  expect(trackRect.width).toBeLessThan(49);
  expect(trackRect.height).toBeGreaterThan(27);
  expect(trackRect.height).toBeLessThan(29);
  expectFullyRound(track);
  expect(getComputedStyle(label).alignItems).toBe("center");

  expect(knobRect.width).toBeGreaterThan(21);
  expect(knobRect.width).toBeLessThan(23);
  expect(knobRect.height).toBeGreaterThan(21);
  expect(knobRect.height).toBeLessThan(23);
  expectFullyRound(knob);
  expect(knobRect.top - trackRect.top).toBeCloseTo(trackRect.bottom - knobRect.bottom, 0);

  const content = screen.getByText("Apply discount").element() as HTMLElement;
  const gap = content.getBoundingClientRect().left - trackRect.right;
  expect(gap).toBeGreaterThan(11);
  expect(gap).toBeLessThan(13);
});

test("colors an off track and its knob white, each with a 2px strong border, the knob at the near end", async () => {
  const screen = await render(
    <Toggle isSelected={false} onChange={() => {}}>
      Apply discount
    </Toggle>,
  );
  const track = toggleTrack(screen, "Apply discount");
  const knob = toggleKnob(screen, "Apply discount");
  const trackRect = track.getBoundingClientRect();
  const knobRect = knob.getBoundingClientRect();

  expect(getComputedStyle(track).backgroundColor).toBe(tokenRgb("surface"));
  expect(getComputedStyle(track).boxShadow).toContain(insetBoundary("border-strong", "2px"));

  expect(getComputedStyle(knob).backgroundColor).toBe(tokenRgb("surface"));
  expect(getComputedStyle(knob).boxShadow).toContain(insetBoundary("border-strong", "2px"));

  // Checked as a rendered contrast ratio against WCAG's 3:1 non-text minimum, not by token name.
  const trackBoundaryHex = boundaryColorHex(track);
  const trackFillHex = rgbToHex(getComputedStyle(track).backgroundColor);
  expect(contrastRatio(trackBoundaryHex, trackFillHex)).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);

  const knobBoundaryHex = boundaryColorHex(knob);
  const knobFillHex = rgbToHex(getComputedStyle(knob).backgroundColor);
  expect(contrastRatio(knobBoundaryHex, knobFillHex)).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);

  expect(knobRect.left - trackRect.left).toBeCloseTo(4, 0);
  expect(trackRect.right - knobRect.right).toBeGreaterThan(10);
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
  await expect.poll(() => getComputedStyle(track).backgroundColor).toBe(tokenRgb("surface-subtle"));
  expect(getComputedStyle(track).boxShadow).toContain(insetBoundary("border-strong", "2px"));
});

test("colors an on track in the success color with no boundary of any color and a surface-colored knob at the far end", async () => {
  const screen = await render(
    <Toggle isSelected onChange={() => {}}>
      Apply discount
    </Toggle>,
  );
  const track = toggleTrack(screen, "Apply discount");
  const knob = toggleKnob(screen, "Apply discount");
  const trackRect = track.getBoundingClientRect();
  const knobRect = knob.getBoundingClientRect();

  expect(getComputedStyle(track).backgroundColor).toBe(tokenRgb("success"));
  expect(paintedBoxShadowLayers(track)).toEqual([]);

  expect(getComputedStyle(knob).backgroundColor).toBe(tokenRgb("surface"));
  expect(paintedBoxShadowLayers(knob)).toEqual([]);

  expect(trackRect.right - knobRect.right).toBeCloseTo(4, 0);
  expect(knobRect.left - trackRect.left).toBeGreaterThan(10);
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
  await expect.poll(() => getComputedStyle(track).backgroundColor).toBe(tokenRgb("success-strong"));
  expect(getComputedStyle(knob).backgroundColor).toBe(tokenRgb("surface"));
});

test("keeps the track's and the knob's size stable between the off and on states", async () => {
  const offScreen = await render(
    <Toggle isSelected={false} onChange={() => {}}>
      Apply discount
    </Toggle>,
  );
  const offTrackRect = toggleTrack(offScreen, "Apply discount").getBoundingClientRect();
  const offKnobRect = toggleKnob(offScreen, "Apply discount").getBoundingClientRect();
  await offScreen.unmount();

  const onScreen = await render(
    <Toggle isSelected onChange={() => {}}>
      Apply discount
    </Toggle>,
  );
  const onTrackRect = toggleTrack(onScreen, "Apply discount").getBoundingClientRect();
  const onKnobRect = toggleKnob(onScreen, "Apply discount").getBoundingClientRect();

  expect(onTrackRect.width).toBeCloseTo(offTrackRect.width, 0);
  expect(onTrackRect.height).toBeCloseTo(offTrackRect.height, 0);

  expect(onKnobRect.width).toBeCloseTo(offKnobRect.width, 0);
  expect(onKnobRect.height).toBeCloseTo(offKnobRect.height, 0);
});

test("toggles when clicking the track", async () => {
  const screen = await render(<Harness />);

  await userEvent.click(toggleTrack(screen, "Apply discount"));

  expect(toggleInput(screen, "Apply discount").checked).toBe(true);
});

test("toggles when clicking the content", async () => {
  const screen = await render(<Harness />);

  await userEvent.click(screen.getByText("Apply discount").element());

  expect(toggleInput(screen, "Apply discount").checked).toBe(true);
});

test("toggles with Space when focused", async () => {
  const screen = await render(<Harness />);

  await userEvent.tab();
  await userEvent.keyboard(" ");

  expect(toggleInput(screen, "Apply discount").checked).toBe(true);
});

test("is a single tab stop", async () => {
  const screen = await render(
    <>
      <button type="button">Before</button>
      <Toggle isSelected={false} onChange={() => {}}>
        Apply discount
      </Toggle>
      <button type="button">After</button>
    </>,
  );

  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Before" }).element());

  await userEvent.tab();
  expect(document.activeElement).toBe(toggleInput(screen, "Apply discount"));

  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "After" }).element());

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
  await expect.poll(() => getComputedStyle(track).outlineColor).toBe(tokenRgb("focus"));
});

test("dims the whole toggle to 45% opacity, drops the pointer cursor and blocks focus when disabled", async () => {
  const screen = await render(
    <>
      <Toggle isSelected={false} onChange={() => {}} disabled>
        Apply discount
      </Toggle>
      <button type="button">Next control</button>
    </>,
  );
  const label = toggleLabel(screen, "Apply discount");
  const input = toggleInput(screen, "Apply discount");
  const nextControl = screen.getByRole("button", { name: "Next control" }).element();

  expect(getComputedStyle(label).opacity).toBe("0.45");
  expect(getComputedStyle(label).cursor).toBe("default");
  expect(input.disabled).toBe(true);

  await userEvent.tab();
  expect(document.activeElement).toBe(nextControl);
  expect(document.activeElement).not.toBe(input);
});

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
