// The only supported locale today. Kept as a closed union (not `string`) so a second locale
// can only be added by widening this type deliberately, and no caller can pass an unsupported one.
export type Locale = "es-AR";

export type PluralForms = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>;

export type MessageFormatters = {
  plural: (count: number, forms: PluralForms) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  date: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
};

export function createFormatters(locale: Locale): MessageFormatters {
  const pluralRules = new Intl.PluralRules(locale);

  return {
    plural: (count, forms) => forms[pluralRules.select(count)] ?? forms.other,
    number: (value, options) => new Intl.NumberFormat(locale, options).format(value),
    date: (value, options) => new Intl.DateTimeFormat(locale, options).format(value),
  };
}
