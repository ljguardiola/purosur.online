import { Lock } from "lucide-react";
import type { ReactElement } from "react";
import { beforeEach, expect, expectTypeOf, test } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AAA_TEXT_CONTRAST, contrastRatio } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import type { DispatchableCdpSession } from "../test/setup-browser";
import { rgbToHex, tokenBackgroundColor, tokenRgb } from "../test/token-colors";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
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
// outside a landmark still fails. Replacing the option replaces the whole list, hence the four
// shipped selectors repeated alongside the new one.
const axeOptions = {
  checks: {
    region: {
      options: { regionMatcher: "dialog, [role=dialog], [role=alertdialog], svg, [role=tooltip]" },
    },
  },
};

// Once a tooltip hides, react-stately starts a cooldown during which the next hover opens a
// tooltip instantly instead of after the delay. It lasts the larger of 500ms and the close delay,
// so 500ms here. The test's wait starts when it sees the tooltip gone, barely after the cooldown
// started, so waiting exactly 500ms would race it; the margin guarantees it has expired.
const REACT_STATELY_COOLDOWN_MS = 500;
const COOLDOWN_MARGIN_MS = 250;
const COOLDOWN_BUFFER_MS = REACT_STATELY_COOLDOWN_MS + COOLDOWN_MARGIN_MS;

// Long enough to outlast react-aria's own 1500ms default delay, so a tooltip that merely opens
// late still reports its elapsed time rather than this.
const MEASUREMENT_DEADLINE_MS = 3000;

function beforeDeadline(measurement: Promise<number>, whatNeverHappened: string): Promise<number> {
  let deadline: ReturnType<typeof setTimeout>;
  const expiry = new Promise<never>((_, reject) => {
    deadline = setTimeout(
      () => reject(new Error(`${whatNeverHappened} within ${MEASUREMENT_DEADLINE_MS}ms`)),
      MEASUREMENT_DEADLINE_MS,
    );
  });

  return Promise.race([measurement, expiry]).finally(() => clearTimeout(deadline));
}

// Everything the browser puts in the sequential tab order, plus the elements that take focus on
// a click without being tabbable: a tooltip must hold none of them, since it closes the moment
// its element loses focus and focus moved into it would land in a box that is about to vanish.
const FOCUSABLE_SELECTOR =
  "a[href], area[href], button, input, select, textarea, details, summary, iframe, object, " +
  'embed, audio[controls], video[controls], [contenteditable=""], [contenteditable="true"], ' +
  "[tabindex]";

// A trigger rendered where a test's own markup lands by default sits at the very top of the
// viewport, where nothing fits above it: react-aria then flips a "top" request to "bottom", so an
// assertion on the default placement would hold even with the placement gone.
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

test("centers a 10px ink diamond on the box's edge, the box 10px clear of the element and the arrow centered on it", async () => {
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
  const arrow = tooltip.querySelector("[data-placement]") as HTMLElement | null;
  expect(arrow, "no arrow element found inside the tooltip").not.toBeNull();
  const diamond = (arrow as HTMLElement).firstElementChild as HTMLElement;

  const diamondStyle = getComputedStyle(diamond);
  expect(diamondStyle.backgroundColor).toBe(tokenRgb("ink"));
  // Tailwind v4's rotate-* utilities set the native CSS `rotate` property rather than composing
  // a `transform: rotate(...)` matrix, so that's the property that actually paints the tilt.
  expect(diamondStyle.rotate).toBe("45deg");
  expect(diamondStyle.width).toBe("10px");
  expect(diamondStyle.height).toBe("10px");

  const tooltipRect = tooltip.getBoundingClientRect();
  const diamondRect = diamond.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();

  // Rotating a square around its own center never moves that center, so the rotated diamond's
  // bounding-rect center is still the plain square's center: the design puts it exactly on the
  // box's edge, half the diamond merged into the box and the rest rotated out into the visible
  // point. Centered anywhere else, either the diamond floats clear of the box (center outside it)
  // or it reads as a plain square merely grazing the box at one corner (center inside it).
  const diamondCenterY = diamondRect.top + diamondRect.height / 2;
  expect(Math.abs(diamondCenterY - tooltipRect.top)).toBeLessThanOrEqual(1);

  // The design's own gap from the element to the box's edge; react-aria floors the offset
  // position to a whole pixel, so it lands at 9 or 10 depending on where the element's own edge
  // falls.
  const boxOffset = tooltipRect.top - triggerRect.bottom;
  expect(boxOffset).toBeGreaterThanOrEqual(9);
  expect(boxOffset).toBeLessThanOrEqual(10);

  const diamondCenterX = diamondRect.left + diamondRect.width / 2;
  const triggerCenterX = triggerRect.left + triggerRect.width / 2;
  expect(Math.abs(diamondCenterX - triggerCenterX)).toBeLessThanOrEqual(1);

  await expectNoAccessibilityViolations(document.body, axeOptions);
});

test("keeps the arrow centered on the box's edge, pointing down at the element, once flipped above it", async () => {
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

  const tooltip = tooltipElement(screen);
  const arrow = tooltip.querySelector("[data-placement]") as HTMLElement | null;
  expect(arrow, "no arrow element found inside the tooltip").not.toBeNull();
  const diamond = (arrow as HTMLElement).firstElementChild as HTMLElement;

  const tooltipRect = tooltip.getBoundingClientRect();
  const diamondRect = diamond.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();

  // Flipped above the element, the arrow sits on the box's bottom edge instead of its top one, so
  // the same three checks are read from the opposite edges.
  const diamondCenterY = diamondRect.top + diamondRect.height / 2;
  expect(Math.abs(diamondCenterY - tooltipRect.bottom)).toBeLessThanOrEqual(1);

  const boxOffset = triggerRect.top - tooltipRect.bottom;
  expect(boxOffset).toBeGreaterThanOrEqual(9);
  expect(boxOffset).toBeLessThanOrEqual(10);

  const diamondCenterX = diamondRect.left + diamondRect.width / 2;
  const triggerCenterX = triggerRect.left + triggerRect.width / 2;
  expect(Math.abs(diamondCenterX - triggerCenterX)).toBeLessThanOrEqual(1);

  await expectNoAccessibilityViolations(document.body, axeOptions);
});

test("keeps the arrow off the box's rounded corner when clamped near a screen edge", async () => {
  await page.viewport(400, 900);

  const screen = await render(
    <div style={{ position: "fixed", top: "50%", left: 370 }}>
      <Tooltip description="Voided at checkout by the manager on duty">
        <IconButton icon={<Lock />} aria-label="Locked role" />
      </Tooltip>
    </div>,
  );
  const trigger = screen.getByRole("button", { name: "Locked role" }).element();

  await userEvent.hover(trigger);
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);

  const tooltip = tooltipElement(screen);
  const arrow = tooltip.querySelector("[data-placement]") as HTMLElement | null;
  expect(arrow, "no arrow element found inside the tooltip").not.toBeNull();
  const diamond = (arrow as HTMLElement).firstElementChild as HTMLElement;

  const tooltipRect = tooltip.getBoundingClientRect();
  const diamondRect = diamond.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();

  // react-aria computes positions from whole-pixel layout sizes while these rects are fractional,
  // so every check below allows one pixel of rounding.
  const SUBPIXEL_ROUNDING_PX = 1;

  // The trigger sits close enough to this narrow viewport's right edge that the box has to shift
  // left to stay on screen, stopping at react-aria's default 12px container padding, and the arrow
  // can no longer reach the trigger's center: this is the case where react-aria's arrow clamp
  // takes over. Unless both hold, the clamp never engaged and the checks below prove nothing.
  const REACT_ARIA_CONTAINER_PADDING_PX = 12;
  expect(
    Math.abs(window.innerWidth - REACT_ARIA_CONTAINER_PADDING_PX - tooltipRect.right),
  ).toBeLessThanOrEqual(SUBPIXEL_ROUNDING_PX);
  const diamondCenterX = diamondRect.left + diamondRect.width / 2;
  const triggerCenterX = triggerRect.left + triggerRect.width / 2;
  expect(triggerCenterX - diamondCenterX).toBeGreaterThan(SUBPIXEL_ROUNDING_PX);

  // react-aria's clamp only reserves room for the plain 10px square it measures, not the wider
  // 14.14px diamond that square's 45deg rotation actually paints. The diamond's whole footprint
  // has to stay on the box's flat edge, clear of its 6px corner radius (rounded-md), where the
  // curve has already pulled the box's fill back and the diamond reads as floating free of the
  // box instead of glued to it.
  const BOX_CORNER_RADIUS_PX = 6;
  expect(tooltipRect.right - diamondRect.right).toBeGreaterThanOrEqual(
    BOX_CORNER_RADIUS_PX - SUBPIXEL_ROUNDING_PX,
  );
  expect(diamondRect.left - tooltipRect.left).toBeGreaterThanOrEqual(
    BOX_CORNER_RADIUS_PX - SUBPIXEL_ROUNDING_PX,
  );

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

test("appears on hover and disappears immediately once the pointer leaves its element", async () => {
  const screen = await render(
    <Tooltip description="Voided at checkout by the manager on duty">
      <Button>Void reason</Button>
    </Tooltip>,
  );
  const trigger = screen.getByRole("button", { name: "Void reason" }).element();

  await userEvent.hover(trigger);
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);
  await expectNoAccessibilityViolations(document.body, axeOptions);

  // Both ends of the interval come from events in the page, the same way the hover-delay test
  // below measures its own interval, so a lingering close (react-stately's own 500ms cooldown)
  // shows up as elapsed time instead of this assertion racing that cooldown.
  const watch = new AbortController();
  let observer: MutationObserver | undefined;
  const leftAt = new Promise<number>((resolve) => {
    trigger.addEventListener("pointerleave", () => resolve(performance.now()), {
      once: true,
      signal: watch.signal,
    });
  });
  const closedAt = new Promise<number>((resolve) => {
    observer = new MutationObserver((records) => {
      const tooltipRemoved = records.some((record) =>
        Array.from(record.removedNodes).some(
          (node) =>
            node instanceof Element &&
            (node.matches('[role="tooltip"]') || node.querySelector('[role="tooltip"]') !== null),
        ),
      );
      if (tooltipRemoved) {
        resolve(performance.now());
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  let elapsedMs: number;
  try {
    await userEvent.unhover(trigger);
    elapsedMs =
      (await beforeDeadline(closedAt, "the tooltip was never removed from the page")) -
      (await beforeDeadline(leftAt, "the pointer never left the element"));
  } finally {
    watch.abort();
    observer?.disconnect();
  }

  // react-stately's own default close delay is 500ms; a bound this far under it distinguishes an
  // immediate close from a lucky race against that cooldown.
  expect(elapsedMs).toBeLessThan(100);

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
  // delay. An earlier test that opened a tooltip can leave it set, so a hover measured straight
  // away would read the instant open rather than the delay. Opening and closing one tooltip first,
  // then outwaiting the 500ms cooldown that the close schedules, is what puts that flag back down
  // so the delay under test is the one that actually runs.
  await userEvent.hover(trigger);
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);
  await userEvent.unhover(trigger);
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(0);
  await new Promise((resolve) => setTimeout(resolve, COOLDOWN_BUFFER_MS));

  // react-aria starts the delay when the pointer enters the element, so both ends of the interval
  // are taken inside the page, where the tooltip's DOM lands: the time the test runner takes to
  // deliver the hover, and how often it would poll, are left out of what is measured.
  const watch = new AbortController();
  let observer: MutationObserver | undefined;
  const enteredAt = new Promise<number>((resolve) => {
    trigger.addEventListener("pointerenter", () => resolve(performance.now()), {
      once: true,
      signal: watch.signal,
    });
  });
  const appearedAt = new Promise<number>((resolve) => {
    observer = new MutationObserver((records) => {
      const tooltipAdded = records.some((record) =>
        Array.from(record.addedNodes).some(
          (node) =>
            node instanceof Element &&
            (node.matches('[role="tooltip"]') || node.querySelector('[role="tooltip"]') !== null),
        ),
      );
      if (tooltipAdded) {
        resolve(performance.now());
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  let elapsedMs: number;
  try {
    await userEvent.hover(trigger);
    // Both ends of the interval come from events in the page rather than from a poll the runner
    // controls, so an end that never arrives would otherwise sit here until the runner gives up on
    // the whole test, reporting its timeout instead of which end went missing.
    elapsedMs =
      (await beforeDeadline(appearedAt, "the tooltip was never added to the page")) -
      (await beforeDeadline(enteredAt, "the pointer never entered the element"));
  } finally {
    watch.abort();
    observer?.disconnect();
  }

  expect(elapsedMs).toBeGreaterThan(280);
  expect(elapsedMs).toBeLessThan(400);

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
