import type { ReactElement } from "react";
import { beforeEach, expect, expectTypeOf, test } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AAA_TEXT_CONTRAST, contrastRatio } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import type { DispatchableCdpSession } from "../test/setup-browser";
import { rgbToHex, tokenBackgroundColor, tokenRgb } from "../test/token-colors";
import { Button } from "./Button";
import { Tooltip, type TooltipProps } from "./Tooltip";

type Screen = Awaited<ReturnType<typeof render>>;

// This package targets desktop POS displays; the default browser-mode viewport is phone-sized,
// which would leave no room below a normally-placed trigger and mask the flip test's premise
// (see Modal.test.tsx:15-17 for the same reasoning applied to another portaled overlay).
beforeEach(async () => {
  await page.viewport(1280, 900);

  // React Aria only opens a tooltip on hover once it has seen a real pointer move: on the very
  // first hover of a fresh page, the browser fires the enter event React Aria listens for before
  // the move event that tells it the current input is a pointer, so that very first hover is
  // silently dropped. A throwaway move over neutral ground, before the test's own hover, gives
  // React Aria that signal in advance so the hover under test is never the first one.
  const session = cdp() as unknown as DispatchableCdpSession;
  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
});

// react-aria-components portals the tooltip's whole DOM into document.body, outside vitest-
// browser-react's own render container (see Modal.test.tsx's own comment on this), so every
// accessibility check in this file audits document.body rather than screen.container.

function tooltipElement(screen: Screen): HTMLElement {
  return screen.getByRole("tooltip").element() as HTMLElement;
}

// axe's "region" best-practice rule exempts role="dialog"/"alertdialog" content from needing a
// landmark ancestor (see Modal.test.tsx's own clean run), on the reasoning that such content is
// deliberately portaled outside the page's landmark structure rather than left drifting in it. A
// tooltip is portaled the same way for the same reason, and is tied to its element correctly
// through aria-describedby rather than DOM position, but axe's shipped exemption list doesn't
// cover role="tooltip". That list is the rule's own regionMatcher option, so every check in this
// file adds the tooltip's role to it and leaves the rule itself running: anything else adrift
// outside a landmark still fails. Replacing the option replaces the whole list, hence the three
// shipped selectors repeated alongside the new one.
const axeOptions = {
  checks: {
    region: {
      options: { regionMatcher: "dialog, [role=dialog], [role=alertdialog], svg, [role=tooltip]" },
    },
  },
};

// react-stately's tooltip cooldown is 500ms; this clears it with room to spare on a loaded
// machine without making the delay test meaningfully slower.
const COOLDOWN_BUFFER_MS = 500;

// Everything the browser puts in the sequential tab order, plus the elements that take focus on
// a click without being tabbable: a tooltip must hold none of them, since it closes the moment
// its element loses focus and focus moved into it would land in a box that is about to vanish.
const FOCUSABLE_SELECTOR =
  "a[href], area[href], button, input, select, textarea, details, summary, iframe, object, " +
  'embed, audio[controls], video[controls], [contenteditable=""], [contenteditable="true"], ' +
  "[tabindex]";

// A trigger rendered where a test's own markup lands by default sits at the very top of the
// viewport, where nothing fits above it: react-aria then flips to "bottom" whatever placement it
// was asked for, so an assertion on the default placement would hold even with the placement gone.
// Every test about where the tooltip lands by default renders its trigger halfway down the 900px
// viewport instead, with room for the box on either side of it, so "below" is a real choice.
const centeredInViewport = { position: "fixed", top: "50%", left: 16 } as const;

test("renders nothing until hovered, focused, or otherwise activated", async () => {
  const screen = await render(
    <Tooltip description="Voided at checkout by the manager on duty">
      <Button>Void reason</Button>
    </Tooltip>,
  );

  expect(screen.getByRole("tooltip").elements()).toHaveLength(0);
  await expectNoAccessibilityViolations(document.body, axeOptions);
});

test("shows a 6px-radius ink box, 12px padding, white 14px/1.35 text at AAA contrast, and the ink-shadow drop shadow below its element by default", async () => {
  const screen = await render(
    <div style={centeredInViewport}>
      <Tooltip description="Voided at checkout by the manager on duty">
        <Button>Void reason</Button>
      </Tooltip>
    </div>,
  );
  const trigger = screen.getByRole("button", { name: "Void reason" }).element();

  await userEvent.hover(trigger);
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);

  const tooltip = tooltipElement(screen);
  const style = getComputedStyle(tooltip);

  expect(style.backgroundColor).toBe(tokenRgb("ink"));
  expect(style.color).toBe(tokenRgb("surface-white"));
  expect(style.borderRadius).toBe("6px");
  expect(style.paddingTop).toBe("12px");
  expect(style.paddingRight).toBe("12px");
  expect(style.paddingBottom).toBe("12px");
  expect(style.paddingLeft).toBe("12px");
  expect(style.fontSize).toBe("14px");
  expect(Number.parseFloat(style.lineHeight)).toBeCloseTo(14 * 1.35, 0);
  expect(style.boxShadow).toContain(tokenBackgroundColor("ink-shadow"));
  expect(style.boxShadow).toContain("6px 16px");
  expect(tooltip.dataset.placement).toBe("bottom");

  // Guards what actually renders (getComputedStyle read on the exact element that both declares
  // the colors and directly contains the description's text node), not just the token pair in
  // isolation: a swap to a pair that still carries these two token names but no longer clears
  // AAA would still pass a token-only check while failing this one.
  const backgroundHex = rgbToHex(style.backgroundColor);
  const textHex = rgbToHex(style.color);
  expect(contrastRatio(textHex, backgroundHex)).toBeGreaterThanOrEqual(AAA_TEXT_CONTRAST);

  await expectNoAccessibilityViolations(document.body, axeOptions);
});

test("points a 10px ink diamond at its element, with the diamond's tip 8px clear of it", async () => {
  const screen = await render(
    <div style={centeredInViewport}>
      <Tooltip description="Voided at checkout by the manager on duty">
        <Button>Void reason</Button>
      </Tooltip>
    </div>,
  );
  const trigger = screen.getByRole("button", { name: "Void reason" }).element();

  await userEvent.hover(trigger);
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);

  const tooltip = tooltipElement(screen);
  const arrow = tooltip.querySelector('[data-placement="bottom"]') as HTMLElement | null;
  expect(arrow, "no OverlayArrow element found inside the tooltip").not.toBeNull();
  const arrowSquare = (arrow as HTMLElement).firstElementChild as HTMLElement;

  expect(getComputedStyle(arrowSquare).backgroundColor).toBe(tokenRgb("ink"));
  // Tailwind v4's rotate-* utilities set the native CSS `rotate` property rather than composing
  // a `transform: rotate(...)` matrix, so that's the property that actually paints the tilt.
  expect(getComputedStyle(arrowSquare).rotate).toBe("45deg");
  // The component computes how far the diamond sticks out past the box from this same size, but
  // Tailwind's compiler only sees the literal in the class, so nothing but this pair of checks
  // and the gap measured below keeps the drawn square and that computation on the same number.
  expect(getComputedStyle(arrowSquare).width).toBe("10px");
  expect(getComputedStyle(arrowSquare).height).toBe("10px");

  // getBoundingClientRect on OverlayArrow's own wrapper would report its unrotated layout box
  // (10x10): a CSS rotation repaints where a box's pixels land without enlarging any ancestor's
  // layout size, so only the rotated square's own rect reflects what's actually on screen.
  const arrowRect = arrowSquare.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();

  // The diamond, not the box behind it, is the nearest thing to the element the user can see, so
  // the 8px of air the tooltip is meant to leave is measured from the diamond's tip; measured
  // against the box instead, the diamond ends up painted over the very element it points at. The
  // half-pixel tolerance is react-aria's: it rounds the box it positions to whole pixels, while
  // the diamond's overhang past that box is an irrational multiple of its side.
  expect(arrowRect.top).toBeGreaterThan(triggerRect.bottom);
  expect(arrowRect.top - triggerRect.bottom).toBeCloseTo(8, 0);

  // "Above, pointing at its element" for the default below-the-trigger placement: the square
  // rotates around its own center, which sits exactly on the tooltip's top edge, so the diamond's
  // lower half is expected to dip slightly into the box (that's what makes its tip look seamless
  // against the fill instead of leaving a gap) — what "above" rules out is the arrow's center, or
  // more, sitting at or below that edge, which a wrong placement or a dropped rotation would both
  // produce.
  expect((arrowRect.top + arrowRect.bottom) / 2).toBeLessThan(tooltipRect.top);
  // The rotated 10px square's bounding box is the 14x14 diamond the design draws.
  expect(arrowRect.width).toBeGreaterThan(13);
  expect(arrowRect.width).toBeLessThan(15);

  await expectNoAccessibilityViolations(document.body, axeOptions);
});

test("caps a long explanation at 300px wide instead of stretching a short one to it", async () => {
  const shortScreen = await render(
    <Tooltip description="Not available">
      <Button>Void reason</Button>
    </Tooltip>,
  );
  await userEvent.hover(shortScreen.getByRole("button", { name: "Void reason" }).element());
  await expect.poll(() => shortScreen.getByRole("tooltip").elements().length).toBe(1);
  const shortRect = tooltipElement(shortScreen).getBoundingClientRect();
  await shortScreen.unmount();

  expect(shortRect.width).toBeLessThan(200);

  const longDescription =
    "The return window for this item closed after fourteen calendar days from the original " +
    "purchase date, and the store's own policy does not allow the manager on duty to extend it " +
    "past that point under any circumstance.";
  const longScreen = await render(
    <Tooltip description={longDescription}>
      <Button>Void reason</Button>
    </Tooltip>,
  );
  await userEvent.hover(longScreen.getByRole("button", { name: "Void reason" }).element());
  await expect.poll(() => longScreen.getByRole("tooltip").elements().length).toBe(1);
  const longTooltip = tooltipElement(longScreen);
  const longRect = longTooltip.getBoundingClientRect();

  expect(longRect.width).toBeGreaterThan(295);
  expect(longRect.width).toBeLessThan(301);
  // A width that only ever caps, never fixes, forces this much text onto more than one line.
  expect(longRect.height).toBeGreaterThan(60);

  await expectNoAccessibilityViolations(document.body, axeOptions);
});

test("appears on hover and disappears once the pointer leaves its element", async () => {
  const screen = await render(
    <Tooltip description="Voided at checkout by the manager on duty">
      <Button>Void reason</Button>
    </Tooltip>,
  );
  const trigger = screen.getByRole("button", { name: "Void reason" }).element();

  await userEvent.hover(trigger);
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);
  await expectNoAccessibilityViolations(document.body, axeOptions);

  await userEvent.unhover(trigger);
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(0);

  await expectNoAccessibilityViolations(document.body, axeOptions);
});

test("appears on keyboard focus and disappears once focus leaves its element", async () => {
  const screen = await render(
    <>
      <Tooltip description="Voided at checkout by the manager on duty">
        <Button>Void reason</Button>
      </Tooltip>
      <Button>Next control</Button>
    </>,
  );

  await userEvent.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Void reason" }).element(),
  );
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);
  await expectNoAccessibilityViolations(document.body, axeOptions);

  await userEvent.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Next control" }).element(),
  );
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(0);

  await expectNoAccessibilityViolations(document.body, axeOptions);
});

test("disappears when Escape is pressed while its element is focused", async () => {
  const screen = await render(
    <Tooltip description="Voided at checkout by the manager on duty">
      <Button>Void reason</Button>
    </Tooltip>,
  );

  await userEvent.tab();
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);
  await expectNoAccessibilityViolations(document.body, axeOptions);

  await userEvent.keyboard("{Escape}");
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(0);
  // Escape dismisses the tooltip, not the page's own focus: the trigger stays focused.
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Void reason" }).element(),
  );

  await expectNoAccessibilityViolations(document.body, axeOptions);
});

test("holds nothing focusable while it is open, so Tab moves past its element to the next control", async () => {
  const screen = await render(
    <>
      <Button>Before</Button>
      <Tooltip description="Voided at checkout by the manager on duty">
        <Button>Void reason</Button>
      </Tooltip>
      <Button>After</Button>
    </>,
  );

  await userEvent.tab();
  await userEvent.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Void reason" }).element(),
  );
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);
  const tooltip = tooltipElement(screen);

  // Asked of the tooltip while it is open, which is the only moment it can be asked at all: the
  // tooltip closes the instant its element loses focus, and a node already detached from the
  // document can neither hold focus nor be tabbed into, so the same questions asked afterwards
  // answer themselves no matter what the tooltip contains.
  expect(tooltip.querySelectorAll(FOCUSABLE_SELECTOR)).toHaveLength(0);
  expect(tooltip.matches(FOCUSABLE_SELECTOR)).toBe(false);
  await expectNoAccessibilityViolations(document.body, axeOptions);

  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "After" }).element());

  await expectNoAccessibilityViolations(document.body, axeOptions);
});

test("exposes the tooltip as its element's description instead of separate content", async () => {
  const screen = await render(
    <Tooltip description="Voided at checkout by the manager on duty">
      <Button>Void reason</Button>
    </Tooltip>,
  );
  const trigger = screen.getByRole("button", { name: "Void reason" }).element();

  await userEvent.hover(trigger);
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);

  const tooltip = tooltipElement(screen);
  expect(trigger.getAttribute("aria-describedby")).toBe(tooltip.id);

  await expectNoAccessibilityViolations(document.body, axeOptions);
});

test("flips from below to above when the default placement would leave the window", async () => {
  const screen = await render(
    <div style={{ position: "fixed", bottom: 4, left: 4 }}>
      <Tooltip description="Voided at checkout by the manager on duty">
        <Button>Void reason</Button>
      </Tooltip>
    </div>,
  );
  const trigger = screen.getByRole("button", { name: "Void reason" }).element();

  await userEvent.hover(trigger);
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);

  await expect.poll(() => tooltipElement(screen).dataset.placement).toBe("top");

  await expectNoAccessibilityViolations(document.body, axeOptions);
});

test("waits 300ms of hover before appearing, neither instantly nor on react-aria's 1500ms default", async () => {
  const screen = await render(
    <Tooltip description="Voided at checkout by the manager on duty">
      <Button>Void reason</Button>
    </Tooltip>,
  );
  const trigger = screen.getByRole("button", { name: "Void reason" }).element();

  // react-stately keeps the tooltip warm-up flag in a module-level variable shared by every
  // tooltip on the page, and while it is set a hover opens instantly instead of waiting out the
  // delay. Any earlier test in this file leaves it set, so measuring a hover straight away reads
  // ~50ms no matter what the delay is. Opening and closing one tooltip first, then outwaiting the
  // 500ms cooldown that the close schedules, is what puts that flag back down so the delay under
  // test is the one that actually runs.
  await userEvent.hover(trigger);
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);
  await userEvent.unhover(trigger);
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(0);
  await new Promise((resolve) => setTimeout(resolve, COOLDOWN_BUFFER_MS));

  const hoveredAt = performance.now();
  await userEvent.hover(trigger);
  // The default poll timeout is shorter than react-aria's own 1500ms default delay, so without a
  // longer one here a reverted delay would surface as an opaque poll timeout rather than as the
  // elapsed time this test is about.
  await expect.poll(() => screen.getByRole("tooltip").elements().length, { timeout: 3000 }).toBe(1);
  const elapsedMs = performance.now() - hoveredAt;

  // Measured on this suite: 333ms at the chosen 300ms, 31ms with the delay dropped to 0, and past
  // 1500ms on react-aria's default. The bounds are drawn close enough around the chosen delay to
  // also exclude 600ms, so a value merely near the right order of magnitude does not pass either.
  expect(elapsedMs).toBeGreaterThan(200);
  expect(elapsedMs).toBeLessThan(500);

  await expectNoAccessibilityViolations(document.body, axeOptions);
});

// See Button.test.tsx's icon/label tests for the same "does not compile" pattern: the caller's
// input is checked at the type level, not just at runtime.
test("does not accept a tooltip without a description", () => {
  expectTypeOf<{ children: ReactElement }>().not.toExtend<TooltipProps>();
});

test("does not accept a tooltip without an element to explain", () => {
  expectTypeOf<{ description: string }>().not.toExtend<TooltipProps>();
});

test("does not accept plain text or more than one element as the thing it explains", () => {
  expectTypeOf<{ description: string; children: string }>().not.toExtend<TooltipProps>();
  expectTypeOf<{ description: string; children: ReactElement[] }>().not.toExtend<TooltipProps>();
});
