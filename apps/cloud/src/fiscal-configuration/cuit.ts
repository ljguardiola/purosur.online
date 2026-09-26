// CUIT shape NN-NNNNNNNN-N: taxpayer-type prefix, per-taxpayer digits, then AFIP's own
// weighted check digit derived from the first ten.
const CUIT_SHAPE_PATTERN = /^(\d{2})-?(\d{8})-?(\d)$/;
const CUIT_CHECK_DIGIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

function checkDigitFor(firstTenDigits: number[]): number | undefined {
  const sum = firstTenDigits.reduce(
    (total, digit, index) => total + digit * (CUIT_CHECK_DIGIT_WEIGHTS[index] ?? 0),
    0,
  );
  const remainder = sum % 11;
  const raw = 11 - remainder;
  if (raw === 11) {
    return 0;
  }
  // AFIP never issues a CUIT whose ten leading digits reduce to this remainder: no check digit
  // makes it valid.
  if (raw === 10) {
    return undefined;
  }
  return raw;
}

export function parseCuit(value: string): string | undefined {
  const match = CUIT_SHAPE_PATTERN.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const [, prefix, body, checkDigitText] = match as unknown as [string, string, string, string];
  const firstTenDigits = `${prefix}${body}`.split("").map(Number);
  const checkDigit = checkDigitFor(firstTenDigits);
  if (checkDigit === undefined || checkDigit !== Number(checkDigitText)) {
    return undefined;
  }
  return `${prefix}-${body}-${checkDigitText}`;
}
