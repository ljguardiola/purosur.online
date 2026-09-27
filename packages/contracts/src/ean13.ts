// GS1's standard EAN-13 check digit algorithm.
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

// GS1's 20-29 range is reserved for restricted-circulation (internal) codes; requiring a valid
// check digit rules out a barcode that merely starts with 2.
export function isInternalBarcode(code: string): boolean {
  return (
    RESTRICTED_CIRCULATION_EAN13_PATTERN.test(code) &&
    Number(code[12]) === ean13CheckDigit(code.slice(0, 12))
  );
}

// GS1's module tables for encoding a digit as 7 bars/spaces under the left (odd/L, even/G) and
// right (R) halves of an EAN-13 barcode.
const LEFT_ODD_PATTERNS = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
];
const LEFT_EVEN_PATTERNS = [
  "0100111",
  "0110011",
  "0011011",
  "0100001",
  "0011101",
  "0111001",
  "0000101",
  "0010001",
  "0001001",
  "0010111",
];
const RIGHT_PATTERNS = [
  "1110010",
  "1100110",
  "1101100",
  "1000010",
  "1011100",
  "1001110",
  "1010000",
  "1000100",
  "1001000",
  "1110100",
];
// GS1's table of which left-half digits use the odd (L) vs. even (G) pattern, selected by the
// EAN-13's first digit (which is never itself encoded as bars).
const FIRST_DIGIT_PARITY = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
];

// GS1's EAN-13 structure: 3-module start guard, 6 left digits under L/G parity, 5-module center
// guard, 6 right digits, 3-module end guard (each character is one bar `1` or space `0`).
export function ean13Modules(code: string): string {
  const parity = FIRST_DIGIT_PARITY[Number(code[0])];
  let modules = "101";
  for (let position = 1; position <= 6; position += 1) {
    const patterns = parity?.[position - 1] === "L" ? LEFT_ODD_PATTERNS : LEFT_EVEN_PATTERNS;
    modules += patterns[Number(code[position])];
  }
  modules += "01010";
  for (let position = 7; position <= 12; position += 1) {
    modules += RIGHT_PATTERNS[Number(code[position])];
  }
  return `${modules}101`;
}
