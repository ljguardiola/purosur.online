export const fieldDisabledClassName = "data-disabled:opacity-disabled";

export const fieldWrapperClassName = `flex flex-col ${fieldDisabledClassName}`;

export const fieldBoxClassName = "flex items-center rounded-lg outline-none";

export const fieldTriggerHoverClassName = "data-hovered:not-data-focused:bg-surface-subtle";

export const fieldHelperClassName = "text-detail text-text-subtle";
export const fieldErrorClassName = "text-detail text-error";

type FieldBoxState = {
  disabled: boolean;
  invalid?: boolean;
  readOnly?: boolean;
  // Opening a menu portaled outside the box moves DOM focus out of it, so `focus-within` alone
  // would drop the focused border the instant the menu opens.
  forcedFocus?: boolean;
};

// Drawn as an inset box-shadow rather than a real border so it never participates in layout.
// `hover:not-focus-within:` keeps the hovered fill from showing once the field is focused,
// regardless of the two Tailwind rules' generated order. A disabled field keeps its resting look
// on the box itself; the wrapper's opacity communicates "disabled", so neither hover nor focus
// treatment applies while it is set.
export function fieldBoxStateClassName({
  disabled,
  invalid = false,
  readOnly = false,
  forcedFocus = false,
}: FieldBoxState): string {
  if (disabled) {
    return "bg-surface inset-ring-2 inset-ring-border";
  }
  if (readOnly) {
    return "bg-surface-subtle inset-ring-2 inset-ring-border focus-within:inset-ring-action";
  }
  if (forcedFocus) {
    return "bg-surface inset-ring-2 inset-ring-action";
  }
  return (
    `bg-surface inset-ring-2 ${invalid ? "inset-ring-error" : "inset-ring-border"} ` +
    "hover:not-focus-within:bg-surface-subtle " +
    "focus-within:inset-ring-action"
  );
}

// WCAG 1.4.3/1.4.11 exempt an inactive component's own text from the contrast minimum, but
// axe-core's color-contrast check only honors that exemption on a node whose own `aria-disabled`
// says so; the wrapper's opacity dip doesn't qualify. react-aria-components' field roots filter
// `aria-disabled` out of forwarded DOM props, so it is set directly on the message elements.
export function disabledTextProps(disabled: boolean): { "aria-disabled"?: true } {
  return disabled ? { "aria-disabled": true } : {};
}

export const menuSurfaceClassName = "rounded-lg border border-border bg-surface shadow-lg";

// react-aria-components portals a popover to the document body as its own, separately stacked
// layer: with no z-index of its own it would paint below any sibling with a real positive
// z-index, since a positive z-index always wins that comparison over an auto one.
export const menuPopoverStyle = { zIndex: "var(--z-index-popover)" };

export const menuOptionClassName =
  "flex h-control-lg cursor-pointer items-center justify-between rounded-md px-3 text-detail font-semibold " +
  "text-text outline-none data-hovered:bg-surface-subtle data-focus-visible:bg-surface-subtle " +
  "data-selected:bg-action-subtle data-selected:text-text-accent " +
  "data-hovered:data-selected:bg-action-subtle " +
  "data-focus-visible:data-selected:bg-action-subtle";
