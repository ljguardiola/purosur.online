import { createFormatters, type Locale, type MessageFormatters } from "./formatters";

// The upper bound `defineMessages`'s builder result is checked against: any nesting of plain
// string leaves and single-argument functions returning a string. `params: never` is deliberate,
// not `any` — a function parameter is checked contravariantly, so `never` is the one type every
// concrete parameter type a call site's own leaf infers is compatible with, without describing
// that type itself (or disabling type checking the way `any` would).
export type MessageTree = {
  [key: string]: string | ((params: never) => string) | MessageTree;
};

// A second locale's catalog can `satisfies MessagesShape<typeof esMessages>` to be held to the
// same keys and the same leaf signatures as the Spanish one, without having to repeat its text.
export type MessagesShape<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => string
    ? (...args: Args) => string
    : T[K] extends string
      ? string
      : MessagesShape<T[K]>;
};

// `const T` keeps the builder's return type as narrow as TypeScript can infer it, so that
// `messages.cart.empty` resolves to a real, typo-checked property instead of a generic index
// signature.
export function defineMessages<const T extends MessageTree>(
  locale: Locale,
  build: (formatters: MessageFormatters) => T,
): T {
  return build(createFormatters(locale));
}
