import { createFormatters, type Locale, type MessageFormatters } from "./formatters";

// `params: never` (not `any`) is checked contravariantly, so it accepts any concrete leaf
// parameter type without disabling type checking.
export type MessageTree = {
  [key: string]: string | ((params: never) => string) | MessageTree;
};

export type MessagesShape<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => string
    ? (...args: Args) => string
    : T[K] extends string
      ? string
      : MessagesShape<T[K]>;
};

export function defineMessages<const T extends MessageTree>(
  locale: Locale,
  build: (formatters: MessageFormatters) => T,
): T {
  return build(createFormatters(locale));
}
