// Mirrors `@purosur/contracts`'s EAN-13 check digit; `ean13-check-digit.test.ts` guards against drift.
function ean13CheckDigit(twelveDigitBody: string): number {
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

export function isInternalBarcode(code: string): boolean {
  return (
    RESTRICTED_CIRCULATION_EAN13_PATTERN.test(code) &&
    Number(code[12]) === ean13CheckDigit(code.slice(0, 12))
  );
}
