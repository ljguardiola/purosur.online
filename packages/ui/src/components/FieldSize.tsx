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
  register: "text-base font-bold text-ink",
  backoffice: "text-sm font-bold text-ink",
};
// A CSS pseudo-element rather than JSX text, since the asterisk is a mark, not caller-owned copy.
export const requiredFieldLabelSuffixClassName = "after:ml-1 after:content-['*']";

export const fieldWrapperGapClassName: Record<FieldSize, string> = {
  register: "gap-1.5",
  backoffice: "gap-1",
};

export const backofficeFieldHeightClassName = "h-12";
export const backofficeFieldBoxClassName = `${backofficeFieldHeightClassName} gap-2 px-3`;
export const backofficeFieldValueClassName = "text-base font-semibold text-ink";
