import type { ReactNode } from "react";
import { FieldLabel } from "./FieldLabel";
import { fieldWrapperGapClassName, useFieldSize } from "./FieldSize";

export type FieldGroupProps = {
  label: ReactNode;
  required?: boolean;
  children: ReactNode;
};

const wrapperClassName = "flex flex-col";

/**
 * The label-and-control column for a control with no visible label of its own — e.g.
 * OptionCardGroup, or a barcode list — drawn at the current FieldSizeProvider's scale with the
 * same label-to-control gap TextField, DateField and Select draw around their own internal label.
 * Owns that gap itself, on top of FieldLabel's own look, so a screen can't quietly pick a
 * different gap class and drift from theirs.
 */
export function FieldGroup({ label, required = false, children }: FieldGroupProps) {
  const size = useFieldSize();
  return (
    <div className={`${wrapperClassName} ${fieldWrapperGapClassName[size]}`}>
      <FieldLabel required={required}>{label}</FieldLabel>
      {children}
    </div>
  );
}
