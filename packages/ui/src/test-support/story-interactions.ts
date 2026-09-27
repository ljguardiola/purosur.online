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
 * Tabs to the element `locateFocused` finds and asserts it received focus, and that
 * `locateFocusRing` (the same element by default) shows react-aria's own `data-focus-visible`
 * attribute, the state its keyboard focus ring is driven by.
 *
 * The two differ for a "group" pattern (Checkbox, Toggle, RadioGroup's and OptionCardGroup's
 * options, SegmentedControl's options): real DOM focus lands on react-aria's own visually hidden
 * native input, while the focus-ring attribute lands on the label that wraps it and draws the ring.
 */
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

/**
 * Opens a listbox-backed trigger (a Select or ListFilter's button, react-aria-components' combobox
 * pattern) by clicking `locate`'s element and asserts its own `aria-expanded` landed on it — the
 * attribute react-aria-components reflects that open state through, rather than a `data-open`
 * attribute on the trigger itself.
 */
export function playClickExpandsTrigger(
  locate: (canvasElement: HTMLElement) => HTMLElement,
): StoryPlayFunction {
  return async ({ canvasElement }) => {
    const target = locate(canvasElement);
    await userEvent.click(target);
    await expect(target).toHaveAttribute("aria-expanded", "true");
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
