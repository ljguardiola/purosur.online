import { expect, userEvent } from "storybook/test";

type PlayContext = { canvasElement: HTMLElement };

export type StoryPlayFunction = (context: PlayContext) => Promise<void>;

/**
 * Hovers the element `locate` finds and asserts react-aria's own `data-hovered` attribute landed
 * on it, for a component whose hover styling is driven by react-aria's `useHover`.
 */
export function playHoverSetsDataHovered(
  locate: (canvasElement: HTMLElement) => HTMLElement,
): StoryPlayFunction {
  return async ({ canvasElement }) => {
    const target = locate(canvasElement);
    await userEvent.hover(target);
    await expect(target).toHaveAttribute("data-hovered");
  };
}

/**
 * Tabs to the element `locate` finds and asserts it both received focus and shows react-aria's
 * own `data-focus-visible` attribute, the state its keyboard focus ring is driven by.
 */
export function playTabReachesFocusVisible(
  locate: (canvasElement: HTMLElement) => HTMLElement,
): StoryPlayFunction {
  return async ({ canvasElement }) => {
    const target = locate(canvasElement);
    await userEvent.tab();
    await expect(target).toHaveFocus();
    await expect(target).toHaveAttribute("data-focus-visible");
  };
}

/**
 * Opens a react-aria trigger (a Select, ListFilter or DateField's calendar toggle) by clicking
 * `locate`'s element and asserts its own `data-open` attribute landed on it.
 */
export function playClickOpensDataOpen(
  locate: (canvasElement: HTMLElement) => HTMLElement,
): StoryPlayFunction {
  return async ({ canvasElement }) => {
    const target = locate(canvasElement);
    await userEvent.click(target);
    await expect(target).toHaveAttribute("data-open");
  };
}

/**
 * Tabs into `locate`'s element and asserts the browser's own `:focus-within` pseudo-class matched
 * its ancestor `within`, for a box styled with CSS `focus-within:` rather than a react-aria
 * focus-ring attribute.
 *
 * There is no equivalent hover helper: `storybook/test`'s `userEvent` dispatches synthetic pointer
 * events, which react-aria's `useHover` (and so its `data-hovered` attribute) reacts to, but which
 * never move the browser's own real cursor, so a native CSS `:hover` box never actually matches.
 */
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
