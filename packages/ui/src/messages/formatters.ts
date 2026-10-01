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

export function formatCents(cents: number): string {
  return `$ ${formatNumber(cents / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPointOfSaleNumber(number: number): string {
  return String(number).padStart(5, "0");
}

export function parsePointOfSaleNumber(text: string): number {
  const digits = text.trim();
  return /^\d+$/.test(digits) ? Number(digits) : Number.NaN;
}

export function formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(LOCALE, options).format(value);
}

export function formatMonthName(month: number): string {
  const name = new Intl.DateTimeFormat(LOCALE, { month: "long", timeZone: "UTC" }).format(
    Date.UTC(2000, month - 1, 1),
  );
  return name.charAt(0).toLocaleUpperCase(LOCALE) + name.slice(1);
}

export function formatMonthAndYear(year: number, month: number): string {
  return `${formatMonthName(month)} ${formatNumber(year, { useGrouping: false })}`;
}
