import type { ReactElement } from "react";

// Only lucide icons interpret a numeric `size` prop; a plain <svg> would ignore it or reject it as
// an invalid DOM attribute. A component imposes the size with CSS instead, so `size` is left out
// of the type a caller's icon element can declare.
export type Icon = ReactElement<{ className?: string }>;

export const iconSlotClassName = {
  "2xs": "inline-flex size-icon-2xs shrink-0 *:size-full",
  md: "inline-flex size-icon-md shrink-0 *:size-full",
  lg: "inline-flex size-icon-lg shrink-0 *:size-full",
  xl: "inline-flex size-icon-xl shrink-0 *:size-full",
  "3xl": "inline-flex size-icon-3xl shrink-0 *:size-full",
  "4xl": "inline-flex size-icon-4xl shrink-0 *:size-full",
} as const;
