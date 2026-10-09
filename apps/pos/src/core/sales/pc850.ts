const HIGH_HALF =
  "ÇüéâäàåçêëèïîìÄÅ" +
  "ÉæÆôöòûùÿÖÜø£Ø×ƒ" +
  "áíóúñÑªº¿®¬½¼¡«»" +
  "░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐" +
  "└┴┬├─┼ãÃ╚╔╩╦╠═╬¤" +
  "ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀" +
  "ÓßÔÒõÕµþÞÚÛÙýÝ¯´" +
  "­±‗¾¶§÷¸°¨·¹³²■ ";

const FIRST_HIGH_BYTE = 0x80;
const UNSUPPORTED = 0x3f;
const SPACE = 0x20;

const BYTE_OF_CHARACTER = new Map(
  Array.from(HIGH_HALF, (character, index) => [character, FIRST_HIGH_BYTE + index] as const),
);

function byteOf(character: string): number {
  const code = character.charCodeAt(0);
  if (code < SPACE || code === 0x7f) {
    return SPACE;
  }
  if (code < FIRST_HIGH_BYTE) {
    return code;
  }
  return BYTE_OF_CHARACTER.get(character) ?? UNSUPPORTED;
}

export function encodePc850(text: string): Uint8Array {
  return Uint8Array.from(Array.from(text.normalize("NFC"), byteOf));
}

export function decodePc850(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) =>
    byte < FIRST_HIGH_BYTE
      ? String.fromCharCode(byte)
      : (Array.from(HIGH_HALF)[byte - FIRST_HIGH_BYTE] ?? "?"),
  ).join("");
}
