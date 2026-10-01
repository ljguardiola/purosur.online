import type { ReactNode } from "react";
import { I18nProvider } from "react-aria-components";
import type { Locale } from "./formatters";

const LOCALE: Locale = "es-AR";

export type LocaleProviderProps = {
  children: ReactNode;
};

export function LocaleProvider({ children }: LocaleProviderProps) {
  return <I18nProvider locale={LOCALE}>{children}</I18nProvider>;
}
