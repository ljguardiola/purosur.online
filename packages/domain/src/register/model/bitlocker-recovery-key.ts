const BLOCK_COUNT = 8;
const BLOCK_DIGITS = 6;
const BLOCK_DIVISOR = 11;
const BLOCK_LIMIT = 720896;

const KEY_PATTERN = new RegExp(
  `^\\d{${BLOCK_DIGITS}}(?:-\\d{${BLOCK_DIGITS}}){${BLOCK_COUNT - 1}}$`,
);
const KEY_IDENTIFIER_PATTERN = /^[0-9A-F]{8}$/;

export function hasBitlockerRecoveryKeyShape(value: string): boolean {
  return KEY_PATTERN.test(value);
}

export function isBitlockerRecoveryKey(value: string): boolean {
  return (
    hasBitlockerRecoveryKeyShape(value) &&
    value
      .split("-")
      .map(Number)
      .every((block) => block % BLOCK_DIVISOR === 0 && block < BLOCK_LIMIT)
  );
}

export function isBitlockerKeyIdentifier(value: string): boolean {
  return KEY_IDENTIFIER_PATTERN.test(value);
}
