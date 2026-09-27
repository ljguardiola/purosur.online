export type Locale = "es-AR";

const LOCALE: Locale = "es-AR";

export type PluralForms = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>;

const pluralRules = new Intl.PluralRules(LOCALE);

export function plural(count: number, forms: PluralForms): string {
  return forms[pluralRules.select(count)] ?? forms.other;
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(LOCALE, options).format(value);
}

export function formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(LOCALE, options).format(value);
}

export type MessageFormatters = {
  plural: typeof plural;
  number: typeof formatNumber;
  date: typeof formatDate;
};

export function createFormatters(_locale: Locale): MessageFormatters {
  return { plural, number: formatNumber, date: formatDate };
}
