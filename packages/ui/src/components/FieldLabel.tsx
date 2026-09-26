import type { ReactNode } from "react";
import { fieldLabelClassName, requiredFieldLabelSuffixClassName, useFieldSize } from "./FieldSize";

export type FieldLabelProps = {
  children: ReactNode;
  required?: boolean;
};

/**
 * A field's own visible caption, drawn at the current FieldSizeProvider's scale, for a control
 * that draws its own label separately from TextField/DateField/Select's internal one — a
 * "pseudo-label" ahead of a control with no visible label of its own (e.g. OptionCardGroup, or a
 * barcode list). Reuses the exact classes those fields already draw their own label with, so a
 * screen can't quietly redefine the look and drift from theirs.
 */
export function FieldLabel({ children, required = false }: FieldLabelProps) {
  const size = useFieldSize();
  const className = required
    ? `${fieldLabelClassName[size]} ${requiredFieldLabelSuffixClassName}`
    : fieldLabelClassName[size];
  return <span className={className}>{children}</span>;
}
