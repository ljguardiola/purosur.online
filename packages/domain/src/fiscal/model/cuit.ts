const CUIT_SHAPE_PATTERN = /^(?<prefix>\d{2})-(?<body>\d{8})-(?<checkDigit>\d)$/;
const CUIT_CHECK_DIGIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

function checkDigitFor(firstTenDigits: number[]): number | undefined {
  const sum = firstTenDigits.reduce(
    (total, digit, index) => total + digit * (CUIT_CHECK_DIGIT_WEIGHTS[index] ?? 0),
    0,
  );
  const raw = 11 - (sum % 11);
  if (raw === 11) {
    return 0;
  }
  // ARCA never issues a CUIT whose ten leading digits reduce to this remainder: no check digit
  // makes it valid.
  if (raw === 10) {
    return undefined;
  }
  return raw;
}

export function isValidCuit(value: string): boolean {
  const groups = CUIT_SHAPE_PATTERN.exec(value)?.groups;
  if (!groups?.["prefix"] || !groups["body"] || !groups["checkDigit"]) {
    return false;
  }
  const { prefix, body, checkDigit } = groups;
  const firstTenDigits = `${prefix}${body}`.split("").map(Number);
  return checkDigitFor(firstTenDigits) === Number(checkDigit);
}
