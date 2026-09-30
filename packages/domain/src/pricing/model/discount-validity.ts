const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDay(day: string): boolean {
  if (!ISO_DAY.test(day)) {
    return false;
  }
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(day);
}

// ISO calendar days order the same way as text.
export function isDiscountWindowOrdered(validFrom: string, validTo: string): boolean {
  return validTo >= validFrom;
}
