import type { ReactNode } from "react";
import { FieldLabel } from "./field-label";
import { fieldWrapperGapClassName, useFieldSize } from "./field-size";
import { fieldHelperClassName } from "./field-styles";

export type FieldGroupProps = {
  label: ReactNode;
  required?: boolean;
  description?: string;
  children: ReactNode;
};

const wrapperClassName = "flex flex-col";

export function FieldGroup({ label, required = false, description, children }: FieldGroupProps) {
  const size = useFieldSize();
  return (
    <div className={`${wrapperClassName} ${fieldWrapperGapClassName[size]}`}>
      <FieldLabel required={required}>{label}</FieldLabel>
      {children}
      {description === undefined ? null : <p className={fieldHelperClassName}>{description}</p>}
    </div>
  );
}
