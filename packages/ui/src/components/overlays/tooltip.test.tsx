import { Lock } from "lucide-react";
import type { ReactElement } from "react";
import { beforeEach, expect, expectTypeOf, type TestContext, test, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AAA_TEXT_CONTRAST, contrastRatio } from "../../styles/contrast";
import { expectNoAccessibilityViolations } from "../../test/axe";
import type { DispatchableCdpSession } from "../../test/setup-browser";
import { paletteColor, rgbToHex, tokenRgb } from "../../test/token-colors";
import { Button } from "../forms/button";
import { IconButton } from "../forms/icon-button";
import { CLOSE_DELAY_MS, Tooltip, type TooltipProps } from "./tooltip";

type Screen = Awaited<ReturnType<typeof render>>;

// The default browser-mode viewport is phone-sized, leaving no room below a trigger for the flip
// test's premise.
beforeEach(async () => {
  await page.viewport(1280, 900);

  // On a fresh page, the first hover's enter event fires before React Aria's pointer-move signal
  // and is silently dropped; a throwaway move gives it that signal in advance.
  const session = cdp() as unknown as DispatchableCdpSession;
  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
});

// react-aria-components portals the tooltip into document.body, outside the render container, so
// accessibility checks in this file audit document.body.
function tooltipElement(screen: Screen): HTMLElement {
  return screen.getByRole("tooltip").element() as HTMLElement;
}

// A tooltip is portaled like axe's exempt role="dialog"/"alertdialog" but isn't on its exemption
// list, so this adds it — replacing regionMatcher replaces its whole list, hence the repeats.
const axeOptions = {
  checks: {
    region: {
      options: { regionMatcher: "dialog, [role=dialog], [role=alertdialog], svg, [role=tooltip]" },
    },
  },
};

const REACT_STATELY_DEFAULT_CLOSE_DELAY_MS = 500;

// On abort, annotates which page event never arrived, then rejects, letting every pending finally
// block (frozen timers included) still run.
function beforeDeadline<T>(
  measurement: Promise<T>,
  whatNeverHappened: string,
  { signal, annotate }: Pick<TestContext, "signal" | "annotate">,
): Promise<T> {
  let fail = () => {};
  const timedOut = new Promise<never>((_, reject) => {
    fail = () => {
      void annotate(whatNeverHappened, "error");
      reject(new Error(whatNeverHappened));
    };
    if (signal.aborted) fail();
    signal.addEventListener("abort", fail, { once: true });
  });

  return Promise.race([measurement, timedOut]).finally(() =>
    signal.removeEventListener("abort", fail),
  );
}

function whenTooltipIs(change: "added" | "removed", signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const observer = new MutationObserver((records) => {
      const changed = records.some((record) =>
        Array.from(change === "added" ? record.addedNodes : record.removedNodes).some(
          (node) =>
            node instanceof Element &&
            (node.matches('[role="tooltip"]') || node.querySelector('[role="tooltip"]') !== null),
        ),
      );
      if (changed) {
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  });
}

// expect.poll would advance frozen timers on every retry, so steps wait on page events through
// beforeDeadline instead; every pending timer runs before real ones return, so nothing leaks.
async function whileTimersFrozen(steps: () => Promise<void>): Promise<void> {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    await steps();
  } finally {
    vi.runAllTimers();
    vi.useRealTimers();
  }
}

// Also elements that take focus on click without being tabbable: a tooltip must hold none of
// these, since it closes the moment its element loses focus.
const FOCUSABLE_SELECTOR =
  "a[href], area[href], button, input, select, textarea, details, summary, iframe, object, " +
  'embed, audio[controls], video[controls], [contenteditable=""], [contenteditable="true"], ' +
  "[tabindex]";

// Halfway down the viewport, with room on either side, so a default "bottom" placement is a real
// choice and not just react-aria flipping away from an unavoidable top clamp.
const centeredInViewport = { position: "fixed", top: "50%", left: 16 } as const;

test("renders nothing until hovered, focused, or otherwise activated", async () => {
  const screen = await render(
    <Tooltip description="Voided at checkout by the manager on duty">
      <Button>Void reason</Button>
    </Tooltip>,
  );

  expect(screen.getByRole("tooltip").elements()).toHaveLength(0);
});

test("shows a 6px-radius ink box, 12px padding, white 14px/1.35 text at AAA contrast, and the drop shadow below its element by default", async () => {
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

  expect(style.backgroundColor).toBe(tokenRgb("surface-inverse"));
  expect(style.color).toBe(tokenRgb("text-inverse"));
  expect(style.borderRadius).toBe("6px");
  expect(style.paddingTop).toBe("12px");
  expect(style.paddingRight).toBe("12px");
  expect(style.paddingBottom).toBe("12px");
  expect(style.paddingLeft).toBe("12px");
  expect(style.fontSize).toBe("14px");
  expect(Number.parseFloat(style.lineHeight)).toBeCloseTo(14 * 1.35, 0);
  expect(style.boxShadow).toContain(paletteColor("neutral-900-a12"));
  expect(style.boxShadow).toContain("6px 16px");
  expect(tooltip.dataset["placement"]).toBe("bottom");

  // Checked as a rendered contrast ratio, not by token name, so a token swap can't quietly drop below AAA.
  const backgroundHex = rgbToHex(style.backgroundColor);
  const textHex = rgbToHex(style.color);
  expect(contrastRatio(textHex, backgroundHex)).toBeGreaterThanOrEqual(AAA_TEXT_CONTRAST);
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
  expect(diamondStyle.backgroundColor).toBe(tokenRgb("surface-inverse"));
  // Tailwind v4's rotate-* utilities set the native `rotate` property, not a `transform` matrix.
  expect(diamondStyle.rotate).toBe("45deg");
  expect(diamondStyle.width).toBe("10px");
  expect(diamondStyle.height).toBe("10px");

  const tooltipRect = tooltip.getBoundingClientRect();
  const diamondRect = diamond.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();

  // Rotation never moves the square's center, so the diamond's bounding-rect center is expected
  // exactly on the box's edge.
  const diamondCenterY = diamondRect.top + diamondRect.height / 2;
  expect(Math.abs(diamondCenterY - tooltipRect.top)).toBeLessThanOrEqual(1);

  // react-aria floors the offset to a whole pixel, landing at 9 or 10.
  const boxOffset = tooltipRect.top - triggerRect.bottom;
  expect(boxOffset).toBeGreaterThanOrEqual(9);
  expect(boxOffset).toBeLessThanOrEqual(10);

  const diamondCenterX = diamondRect.left + diamondRect.width / 2;
  const triggerCenterX = triggerRect.left + triggerRect.width / 2;
  expect(Math.abs(diamondCenterX - triggerCenterX)).toBeLessThanOrEqual(1);
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
  await expect.poll(() => tooltipElement(screen).dataset["placement"]).toBe("top");

  const tooltip = tooltipElement(screen);
  const arrow = tooltip.querySelector("[data-placement]") as HTMLElement | null;
  expect(arrow, "no arrow element found inside the tooltip").not.toBeNull();
  const diamond = (arrow as HTMLElement).firstElementChild as HTMLElement;

  const tooltipRect = tooltip.getBoundingClientRect();
  const diamondRect = diamond.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();

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

  // react-aria's layout sizes are whole pixels while these rects are fractional.
  const SUBPIXEL_ROUNDING_PX = 1;

  const REACT_ARIA_CONTAINER_PADDING_PX = 12;
  expect(
    Math.abs(window.innerWidth - REACT_ARIA_CONTAINER_PADDING_PX - tooltipRect.right),
  ).toBeLessThanOrEqual(SUBPIXEL_ROUNDING_PX);
  const diamondCenterX = diamondRect.left + diamondRect.width / 2;
  const triggerCenterX = triggerRect.left + triggerRect.width / 2;
  expect(triggerCenterX - diamondCenterX).toBeGreaterThan(SUBPIXEL_ROUNDING_PX);

  // react-aria's clamp only reserves room for the unrotated 10px square, not the wider diamond.
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
  expect(longRect.height).toBeGreaterThan(60);
});

test("stays open while the pointer moves from its element onto the tooltip itself", async (context) => {
  const ui = (
    <div style={centeredInViewport}>
      <Tooltip description="Voided at checkout by the manager on duty">
        <Button>Void reason</Button>
      </Tooltip>
    </div>
  );
  const screen = await render(ui);
  const trigger = screen.getByRole("button", { name: "Void reason" }).element();

  await userEvent.hover(trigger);
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);
  const tooltip = tooltipElement(screen);

  // Under the left edge, not the center, since the arrow bridges most of the gap there.
  const triggerRect = trigger.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const gapX = triggerRect.left;
  const gapY = (triggerRect.bottom + tooltipRect.top) / 2;
  const gapElement = document.elementFromPoint(gapX, gapY);
  expect(gapElement, "nothing at all found at the gap point").not.toBeNull();
  expect(trigger.contains(gapElement)).toBe(false);
  expect(tooltip.contains(gapElement)).toBe(false);

  // Frozen timers rule out a slow runner letting the close fire mid-crossing; rerendering commits
  // whatever it scheduled before the assertion below reads the page.
  const watch = new AbortController();
  const leftElement = new Promise<void>((resolve) => {
    trigger.addEventListener("pointerleave", () => resolve(), { once: true, signal: watch.signal });
  });
  const reachedTooltip = new Promise<void>((resolve) => {
    tooltip.addEventListener("pointerenter", () => resolve(), { once: true, signal: watch.signal });
  });
  const session = cdp() as unknown as DispatchableCdpSession;
  try {
    await whileTimersFrozen(async () => {
      await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: gapX, y: gapY });
      await beforeDeadline(leftElement, "the pointer never left the element", context);
      await session.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: tooltipRect.left + tooltipRect.width / 2,
        y: tooltipRect.top + tooltipRect.height / 2,
      });
      await beforeDeadline(reachedTooltip, "the pointer never reached the tooltip", context);
    });
  } finally {
    watch.abort();
  }
  // WCAG 2.1 SC 1.4.13 (Hoverable).
  await screen.rerender(ui);
  expect(screen.getByRole("tooltip").elements().length).toBe(1);

  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: -1, y: -1 });
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(0);

  await expectNoAccessibilityViolations(document.body, axeOptions);
});

test("appears on hover and disappears within a short grace period once the pointer leaves both its element and the tooltip", async (context) => {
  const ui = (
    <Tooltip description="Voided at checkout by the manager on duty">
      <Button>Void reason</Button>
    </Tooltip>
  );
  const screen = await render(ui);
  const trigger = screen.getByRole("button", { name: "Void reason" }).element();

  await userEvent.hover(trigger);
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);
  const tooltip = tooltipElement(screen);

  const awayX = window.innerWidth - 1;
  const awayY = window.innerHeight - 1;
  const awayElement = document.elementFromPoint(awayX, awayY);
  expect(trigger.contains(awayElement)).toBe(false);
  expect(tooltip.contains(awayElement)).toBe(false);

  expect(CLOSE_DELAY_MS).toBeLessThan(REACT_STATELY_DEFAULT_CLOSE_DELAY_MS);
  const watch = new AbortController();
  const leftElement = new Promise<void>((resolve) => {
    trigger.addEventListener("pointerleave", () => resolve(), { once: true, signal: watch.signal });
  });
  const closed = whenTooltipIs("removed", watch.signal);
  const session = cdp() as unknown as DispatchableCdpSession;
  try {
    await whileTimersFrozen(async () => {
      await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: awayX, y: awayY });
      await beforeDeadline(leftElement, "the pointer never left the element", context);

      vi.advanceTimersByTime(CLOSE_DELAY_MS - 1);
      await screen.rerender(ui);
      expect(screen.getByRole("tooltip").elements().length, "closed before the grace ran out").toBe(
        1,
      );

      vi.advanceTimersByTime(1);
      await beforeDeadline(closed, "the tooltip was never removed once the grace ran out", context);
    });
  } finally {
    watch.abort();
  }
});

test("appears on keyboard focus and disappears once focus leaves its element", async (context) => {
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

  const watch = new AbortController();
  const closed = whenTooltipIs("removed", watch.signal);
  try {
    await whileTimersFrozen(async () => {
      await userEvent.tab();
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Next control" }).element(),
      );
      await beforeDeadline(closed, "the tooltip was never removed from the page", context);
    });
  } finally {
    watch.abort();
  }

  await expectNoAccessibilityViolations(document.body, axeOptions);
});

test("disappears when Escape is pressed while its element is focused", async (context) => {
  const screen = await render(
    <Tooltip description="Voided at checkout by the manager on duty">
      <Button>Void reason</Button>
    </Tooltip>,
  );

  await userEvent.tab();
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);

  const watch = new AbortController();
  const closed = whenTooltipIs("removed", watch.signal);
  try {
    await whileTimersFrozen(async () => {
      await userEvent.keyboard("{Escape}");
      await beforeDeadline(closed, "the tooltip was never removed from the page", context);
    });
  } finally {
    watch.abort();
  }
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
});

test("waits 300ms of hover before appearing, neither instantly nor on react-aria's 1500ms default", async (context) => {
  const ui = (
    <Tooltip description="Voided at checkout by the manager on duty">
      <Button>Void reason</Button>
    </Tooltip>
  );
  const screen = await render(ui);
  const trigger = screen.getByRole("button", { name: "Void reason" }).element();

  await userEvent.hover(trigger);
  await expect.poll(() => screen.getByRole("tooltip").elements().length).toBe(1);
  const tooltip = tooltipElement(screen);

  const awayX = window.innerWidth - 1;
  const awayY = window.innerHeight - 1;
  const awayElement = document.elementFromPoint(awayX, awayY);
  expect(trigger.contains(awayElement)).toBe(false);
  expect(tooltip.contains(awayElement)).toBe(false);
  const triggerRect = trigger.getBoundingClientRect();

  const watch = new AbortController();
  const leftElement = new Promise<void>((resolve) => {
    trigger.addEventListener("pointerleave", () => resolve(), { once: true, signal: watch.signal });
  });
  const enteredElement = new Promise<void>((resolve) => {
    trigger.addEventListener("pointerenter", () => resolve(), { once: true, signal: watch.signal });
  });
  const closed = whenTooltipIs("removed", watch.signal);
  const opened = whenTooltipIs("added", watch.signal);
  const session = cdp() as unknown as DispatchableCdpSession;
  try {
    await whileTimersFrozen(async () => {
      // react-stately's warm-up flag opens a hover instantly while set; running the close's
      // cooldown timers above puts it back down before the hover below.
      await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: awayX, y: awayY });
      await beforeDeadline(leftElement, "the pointer never left the element", context);
      vi.runAllTimers();
      await beforeDeadline(closed, "the tooltip was never removed from the page", context);

      await session.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: triggerRect.left + triggerRect.width / 2,
        y: triggerRect.top + triggerRect.height / 2,
      });
      await beforeDeadline(enteredElement, "the pointer never entered the element", context);

      vi.advanceTimersByTime(299);
      await screen.rerender(ui);
      expect(screen.getByRole("tooltip").elements().length, "appeared before 300ms of hover").toBe(
        0,
      );

      vi.advanceTimersByTime(1);
      await beforeDeadline(opened, "the tooltip never appeared after 300ms of hover", context);
    });
  } finally {
    watch.abort();
  }

  await expectNoAccessibilityViolations(document.body, axeOptions);
});

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
