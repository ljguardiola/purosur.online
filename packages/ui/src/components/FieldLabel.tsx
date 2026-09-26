import type { ReactNode } from "react";
import { fieldLabelClassName, requiredFieldLabelSuffixClassName, useFieldSize } from "./FieldSize";

export type FieldLabelProps = {
  children: ReactNode;
  required?: boolean;
};

export function FieldLabel({ children, required = false }: FieldLabelProps) {
  const size = useFieldSize();
  const className = required
    ? `${fieldLabelClassName[size]} ${requiredFieldLabelSuffixClassName}`
    : fieldLabelClassName[size];
  return <span className={className}>{children}</span>;
}
