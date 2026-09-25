/**
 * Computes the standard GS1 EAN-13 check digit for a 12-digit body: each digit is weighted 1, 3,
 * 1, 3, ... left to right, and the check digit is whatever brings that weighted sum to the next
 * multiple of 10 (0 when it is already one).
 */
export function ean13CheckDigit(twelveDigitBody: string): number {
  let weightedSum = 0;
  for (let index = 0; index < twelveDigitBody.length; index += 1) {
    const digit = Number(twelveDigitBody[index]);
    weightedSum += digit * (index % 2 === 0 ? 1 : 3);
  }
  return (10 - (weightedSum % 10)) % 10;
}

export function appendEan13CheckDigit(twelveDigitBody: string): string {
  return `${twelveDigitBody}${ean13CheckDigit(twelveDigitBody)}`;
}

const RESTRICTED_CIRCULATION_EAN13_PATTERN = /^2\d{12}$/;

/**
 * An internal code: an EAN-13 in GS1's 20-29 restricted-circulation range with a valid check
 * digit, the shape the cloud allocates, so a stray code that merely starts with 2 isn't one.
 */
export function isInternalBarcode(code: string): boolean {
  return (
    RESTRICTED_CIRCULATION_EAN13_PATTERN.test(code) &&
    Number(code[12]) === ean13CheckDigit(code.slice(0, 12))
  );
}
