import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { contrastRatio, NON_TEXT_CONTRAST } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import { rgbToHex, tokenRgb } from "../test/token-colors";
import { ProportionBar } from "./ProportionBar";

type Screen = Awaited<ReturnType<typeof render>>;

function proportionBarTrack(screen: Screen): HTMLElement {
  return screen.container.firstElementChild as HTMLElement;
}

function proportionBarFill(screen: Screen): HTMLElement {
  return proportionBarTrack(screen).firstElementChild as HTMLElement;
}

test("renders a 240x10px, 5px-radius track in the blue message background, clipping its content", async () => {
  const screen = await render(<ProportionBar value={0.5} />);
  const track = proportionBarTrack(screen);
  const trackRect = track.getBoundingClientRect();

  expect(trackRect.width).toBeCloseTo(240, 0);
  expect(trackRect.height).toBeCloseTo(10, 0);
  expect(getComputedStyle(track).borderRadius).toBe("5px");
  expect(getComputedStyle(track).backgroundColor).toBe(tokenRgb("brand-blue-message-bg"));
  expect(getComputedStyle(track).overflow).toBe("hidden");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the fill in blue UI, with the track's own 5px radius, sized to the given value", async () => {
  const screen = await render(<ProportionBar value={0.6} />);
  const track = proportionBarTrack(screen);
  const fill = proportionBarFill(screen);
  const trackRect = track.getBoundingClientRect();
  const fillRect = fill.getBoundingClientRect();

  expect(getComputedStyle(fill).backgroundColor).toBe(tokenRgb("brand-blue-ui"));
  expect(getComputedStyle(fill).borderRadius).toBe("5px");
  expect(fillRect.left).toBeCloseTo(trackRect.left, 0);
  expect(fillRect.width).toBeCloseTo(trackRect.width * 0.6, 0);

  await expectNoAccessibilityViolations(screen.container);
});

test("paints no fill for a value of 0", async () => {
  const screen = await render(<ProportionBar value={0} />);
  const fillRect = proportionBarFill(screen).getBoundingClientRect();

  expect(fillRect.width).toBeCloseTo(0, 0);

  await expectNoAccessibilityViolations(screen.container);
});

test("fills the whole track for a value of 1", async () => {
  const screen = await render(<ProportionBar value={1} />);
  const track = proportionBarTrack(screen);
  const fill = proportionBarFill(screen);

  expect(fill.getBoundingClientRect().width).toBeCloseTo(track.getBoundingClientRect().width, 0);

  await expectNoAccessibilityViolations(screen.container);
});

test("clamps a value above 1, painting nothing beyond the track's own width", async () => {
  const screen = await render(<ProportionBar value={1.8} />);
  const track = proportionBarTrack(screen);
  const fill = proportionBarFill(screen);
  const trackRect = track.getBoundingClientRect();
  const fillRect = fill.getBoundingClientRect();

  expect(fillRect.width).toBeCloseTo(trackRect.width, 0);
  expect(fillRect.right).toBeCloseTo(trackRect.right, 0);

  await expectNoAccessibilityViolations(screen.container);
});

test("clamps a value below 0, painting nothing", async () => {
  const screen = await render(<ProportionBar value={-0.4} />);
  const fillRect = proportionBarFill(screen).getBoundingClientRect();

  expect(fillRect.width).toBeCloseTo(0, 0);

  await expectNoAccessibilityViolations(screen.container);
});

test("meets the non-text contrast minimum between the fill and the track it sits on", async () => {
  const screen = await render(<ProportionBar value={0.5} />);
  const track = proportionBarTrack(screen);
  const fill = proportionBarFill(screen);

  const trackHex = rgbToHex(getComputedStyle(track).backgroundColor);
  const fillHex = rgbToHex(getComputedStyle(fill).backgroundColor);

  expect(contrastRatio(fillHex, trackHex)).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);

  await expectNoAccessibilityViolations(screen.container);
});
