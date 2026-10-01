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

const relativeTime = new Intl.RelativeTimeFormat(LOCALE, { numeric: "always" });

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
const DAYS_PER_MONTH = 30;

export function formatTimeAgo(seconds: number): string {
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  if (days >= DAYS_PER_MONTH) {
    return relativeTime.format(-Math.floor(days / DAYS_PER_MONTH), "month");
  }
  if (days >= 1) {
    return relativeTime.format(-days, "day");
  }
  if (seconds >= SECONDS_PER_HOUR) {
    return relativeTime.format(-Math.floor(seconds / SECONDS_PER_HOUR), "hour");
  }
  return relativeTime.format(-Math.floor(seconds / SECONDS_PER_MINUTE), "minute");
}
