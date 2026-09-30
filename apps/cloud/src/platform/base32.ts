const RFC4648_BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32EncodeUnpadded(bytes: Buffer): string {
  let bitBuffer = 0;
  let bitCount = 0;
  let encoded = "";

  for (const byte of bytes) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      encoded += RFC4648_BASE32_ALPHABET[(bitBuffer >> bitCount) & 0b11111];
    }
  }
  if (bitCount > 0) {
    encoded += RFC4648_BASE32_ALPHABET[(bitBuffer << (5 - bitCount)) & 0b11111];
  }

  return encoded;
}
