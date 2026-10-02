// ISO calendar days order the same way as text.
export function isDiscountWindowOrdered(validFrom: string, validTo: string): boolean {
  return validTo >= validFrom;
}
