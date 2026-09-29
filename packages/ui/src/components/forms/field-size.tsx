import { createContext, type ReactNode, useContext } from "react";

export type FieldSize = "register" | "backoffice";

const FieldSizeContext = createContext<FieldSize>("register");

export type FieldSizeProviderProps = {
  size: FieldSize;
  children: ReactNode;
};

export function FieldSizeProvider({ size, children }: FieldSizeProviderProps) {
  return <FieldSizeContext.Provider value={size}>{children}</FieldSizeContext.Provider>;
}

export function useFieldSize(): FieldSize {
  return useContext(FieldSizeContext);
}

export const fieldLabelClassName: Record<FieldSize, string> = {
  register: "text-body font-bold text-text",
  backoffice: "text-detail font-bold text-text",
};
export const requiredFieldLabelSuffixClassName = "required-mark";

export const fieldWrapperGapClassName: Record<FieldSize, string> = {
  register: "gap-1.5",
  backoffice: "gap-1",
};

export const backofficeFieldHeightClassName = "h-control-2xl";
export const backofficeFieldInsetClassName = "px-3";
export const backofficeFieldBoxClassName = `${backofficeFieldHeightClassName} gap-2 ${backofficeFieldInsetClassName}`;
export const backofficeFieldValueClassName = "text-body font-semibold text-text";
