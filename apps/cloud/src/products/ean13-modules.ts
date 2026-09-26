// Mirrors `@purosur/contracts`'s EAN-13 module encoder; the drift test guards against drift.
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
