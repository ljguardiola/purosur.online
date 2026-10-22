const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const BASE = 45;

const VALUE_OF = new Map([...ALPHABET].map((character, value) => [character, value]));

export function base45Encode(bytes: Uint8Array): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 2) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    if (second === undefined) {
      encoded += ALPHABET.charAt(first % BASE) + ALPHABET.charAt(Math.floor(first / BASE));
    } else {
      const value = first * 256 + second;
      encoded +=
        ALPHABET.charAt(value % BASE) +
        ALPHABET.charAt(Math.floor(value / BASE) % BASE) +
        ALPHABET.charAt(Math.floor(value / (BASE * BASE)));
    }
  }
  return encoded;
}

export function base45Decode(text: string): Uint8Array | null {
  if (text.length % 3 === 1) return null;
  const values: number[] = [];
  for (const character of text) {
    const value = VALUE_OF.get(character);
    if (value === undefined) return null;
    values.push(value);
  }
  const bytes: number[] = [];
  for (let index = 0; index < values.length; index += 3) {
    const [c = 0, d = 0, e] = values.slice(index, index + 3);
    if (e === undefined) {
      const value = c + d * BASE;
      if (value > 255) return null;
      bytes.push(value);
    } else {
      const value = c + d * BASE + e * BASE * BASE;
      if (value > 65535) return null;
      bytes.push(value >> 8, value & 255);
    }
  }
  return Uint8Array.from(bytes);
}
