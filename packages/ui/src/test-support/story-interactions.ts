import { expect, userEvent, waitFor, within } from "storybook/test";
import { tokenRgb } from "../test/token-colors";

type PlayContext = { canvasElement: HTMLElement };

export type StoryPlayFunction = (context: PlayContext) => Promise<void>;

export function playHoverSetsDataHovered(
  locate: (canvasElement: HTMLElement) => HTMLElement,
): StoryPlayFunction {
  return async ({ canvasElement }) => {
    const target = locate(canvasElement);
    await userEvent.hover(target);
    await expect(target).toHaveAttribute("data-hovered");
  };
}

// In react-aria's group patterns (Checkbox, Toggle, radio and segmented options) DOM focus lands on
// a visually hidden native input, while data-focus-visible lands on the label that draws the ring.
export function playTabReachesFocusVisible(
  locateFocused: (canvasElement: HTMLElement) => HTMLElement,
  locateFocusRing: (canvasElement: HTMLElement) => HTMLElement = locateFocused,
): StoryPlayFunction {
  return async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(locateFocused(canvasElement)).toHaveFocus();
    await expect(locateFocusRing(canvasElement)).toHaveAttribute("data-focus-visible");
  };
}

// react-aria-components reflects a listbox trigger's open state through aria-expanded, not a
// data-open attribute on the trigger.
export function playClickExpandsTrigger(
  locate: (canvasElement: HTMLElement) => HTMLElement,
): StoryPlayFunction {
  return async ({ canvasElement }) => {
    const target = locate(canvasElement);
    await userEvent.click(target);
    await expect(target).toHaveAttribute("aria-expanded", "true");
  };
}

function listboxOption(name: string): HTMLElement {
  return within(document.body).getByRole("option", { name });
}

export function playHoverListboxOption(
  locateTrigger: (canvasElement: HTMLElement) => HTMLElement,
  optionName: string,
): StoryPlayFunction {
  return async ({ canvasElement }) => {
    await userEvent.click(locateTrigger(canvasElement));
    const option = listboxOption(optionName);
    await userEvent.hover(option);
    await expect(option).toHaveAttribute("data-hovered");
  };
}

export function playArrowKeyFocusesListboxOption(
  locateTrigger: (canvasElement: HTMLElement) => HTMLElement,
  optionName: string,
): StoryPlayFunction {
  return async ({ canvasElement }) => {
    await userEvent.click(locateTrigger(canvasElement));
    await userEvent.keyboard("{ArrowDown}");
    const option = listboxOption(optionName);
    await expect(option).toHaveFocus();
    await expect(option).toHaveAttribute("data-focus-visible");
  };
}

// userEvent dispatches synthetic pointer events, which never make a CSS :hover rule match; the
// pseudo-states addon forces it instead, rewriting its stylesheet rules only after the story mounts.
export function playPseudoHoverPaintsBoneFill(
  locate: (canvasElement: HTMLElement) => HTMLElement,
): StoryPlayFunction {
  return async ({ canvasElement }) => {
    const target = locate(canvasElement);
    await waitFor(() => {
      expect(getComputedStyle(target).backgroundColor).toBe(tokenRgb("surface-subtle"));
    });
  };
}

export function playTabMatchesCssFocusWithin(
  locate: (canvasElement: HTMLElement) => HTMLElement,
  within: (canvasElement: HTMLElement) => HTMLElement,
): StoryPlayFunction {
  return async ({ canvasElement }) => {
    await userEvent.tab();
    const target = locate(canvasElement);
    await expect(target).toHaveFocus();
    expect(within(canvasElement).matches(":focus-within")).toBe(true);
  };
}

export function playTabMatchesCssFocusVisible(
  locate: (canvasElement: HTMLElement) => HTMLElement,
): StoryPlayFunction {
  return async ({ canvasElement }) => {
    await userEvent.tab();
    const target = locate(canvasElement);
    await expect(target).toHaveFocus();
    expect(target.matches(":focus-visible")).toBe(true);
  };
}

// A story's screenshot must not change with the day it is taken, and a story cannot import vitest's
// fake timers because Storybook runs it too. Only the play function opens what reads the clock,
// so the clock is replaced for its duration and put back afterwards.
export function playWithClockAt(isoDate: string, play: StoryPlayFunction): StoryPlayFunction {
  return async (context) => {
    const RealDate = globalThis.Date;
    const fixed = RealDate.parse(isoDate);
    class FixedDate extends RealDate {
      constructor(
        ...args:
          | []
          | [value: number | string | Date]
          | [
              year: number,
              monthIndex: number,
              date?: number,
              hours?: number,
              minutes?: number,
              seconds?: number,
              ms?: number,
            ]
      ) {
        if (args.length === 0) {
          super(fixed);
        } else if (args.length === 1) {
          super(args[0]);
        } else {
          super(...args);
        }
      }

      static override now(): number {
        return fixed;
      }
    }
    globalThis.Date = FixedDate as unknown as DateConstructor;
    try {
      await play(context);
    } finally {
      globalThis.Date = RealDate;
    }
  };
}
