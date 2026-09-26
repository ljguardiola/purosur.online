import { createContext, type ReactNode, useContext } from "react";

/**
 * The two field sizes the design draws: "register" for the point-of-sale app (this package's own
 * long-standing scale) and "backoffice" for every backoffice screen. A field with no
 * FieldSizeProvider above it draws at the register scale, so the register app needs none.
 */
export type FieldSize = "register" | "backoffice";

const FieldSizeContext = createContext<FieldSize>("register");

export type FieldSizeProviderProps = {
  size: FieldSize;
  children: ReactNode;
};

/**
 * Chooses the field size for every TextField and DateField underneath, once, instead of each
 * screen passing its own size to each field. The backoffice app's own root provides "backoffice"
 * once (see apps/backoffice/src/App.tsx); nothing renders this for the register app, whose fields
 * keep the default register scale.
 */
export function FieldSizeProvider({ size, children }: FieldSizeProviderProps) {
  return <FieldSizeContext.Provider value={size}>{children}</FieldSizeContext.Provider>;
}

export function useFieldSize(): FieldSize {
  return useContext(FieldSizeContext);
}

// The label's own typography per size, drawn identically by TextField, DateField and FieldLabel
// (which reads the same context) in both sizes; Select only ever draws the backoffice entry,
// since the design has no register-scale select.
export const fieldLabelClassName: Record<FieldSize, string> = {
  register: "text-base font-bold text-ink",
  backoffice: "text-sm font-bold text-ink",
};
// The asterisk is a CSS pseudo-element, not JSX text: a language-agnostic mark rather than
// caller-owned copy, appended to the label's own class list only when the field is required.
export const requiredFieldLabelSuffixClassName = "after:ml-1 after:content-['*']";

// The gap between the label and the box, drawn identically by TextField and DateField in both
// sizes.
export const fieldWrapperGapClassName: Record<FieldSize, string> = {
  register: "gap-1.5",
  backoffice: "gap-1",
};

// The one frame the design draws identically for every backoffice field — text, date or select:
// 48px height, 8px internal gap, 12px horizontal padding, and a 16px semibold ink value.
// TextField's and DateField's own register scale still varies by component (a plain-text
// TextField and a DateField draw different register heights and values), so only the backoffice
// entry is shared here; Select draws only this one, since the design has no register-scale select.
export const backofficeFieldHeightClassName = "h-12";
export const backofficeFieldBoxClassName = `${backofficeFieldHeightClassName} gap-2 px-3`;
export const backofficeFieldValueClassName = "text-base font-semibold text-ink";
