export function isCalendarDay(day: string): boolean {
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

// ISO calendar days order the same way as text.
export function isDiscountWindowOrdered(validFrom: string, validTo: string): boolean {
  return validTo >= validFrom;
}
