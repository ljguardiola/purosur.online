import type { ReactNode } from "react";
import { FieldLabel } from "./field-label";
import { fieldWrapperGapClassName, useFieldSize } from "./field-size";

export type FieldGroupProps = {
  label: ReactNode;
  required?: boolean;
  children: ReactNode;
};

const wrapperClassName = "flex flex-col";

export function FieldGroup({ label, required = false, children }: FieldGroupProps) {
  const size = useFieldSize();
  return (
    <div className={`${wrapperClassName} ${fieldWrapperGapClassName[size]}`}>
      <FieldLabel required={required}>{label}</FieldLabel>
      {children}
    </div>
  );
}
