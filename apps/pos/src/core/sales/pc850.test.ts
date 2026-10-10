import { describe, expect, it } from "vitest";
import { decodePc850, encodePc850 } from "./pc850";

describe("encoding text for the printer's PC850 code page", () => {
  it("keeps plain ASCII as it is", () => {
    expect(Array.from(encodePc850("Yerba 350 g $,.-"))).toEqual(
      Array.from("Yerba 350 g $,.-", (character) => character.charCodeAt(0)),
    );
  });

  it.each([
    ["á", 0xa0],
    ["é", 0x82],
    ["í", 0xa1],
    ["ó", 0xa2],
    ["ú", 0xa3],
    ["ñ", 0xa4],
    ["Ñ", 0xa5],
    ["ü", 0x81],
    ["¡", 0xad],
    ["¿", 0xa8],
    ["º", 0xa7],
    ["·", 0xfa],
    ["─", 0xc4],
  ])("writes %s as the byte %i of the page", (character, byte) => {
    expect(Array.from(encodePc850(character))).toEqual([byte]);
  });

  it("writes a character the page does not have as a question mark", () => {
    expect(Array.from(encodePc850("€"))).toEqual([0x3f]);
  });

  it("writes a letter written with a combining accent as the page's single letter", () => {
    expect(Array.from(encodePc850("é"))).toEqual([0x82]);
  });
});

describe("decoding bytes of the printer's PC850 code page", () => {
  it("reads back every character the page holds", () => {
    const everyByte = Uint8Array.from({ length: 256 }, (_, byte) => byte).filter(
      (byte) => byte >= 0x20 && byte !== 0x7f,
    );

    expect(encodePc850(decodePc850(everyByte))).toEqual(everyByte);
  });

  it("reads a Spanish sentence", () => {
    expect(
      decodePc850(Uint8Array.from([0xad, 0x41, 0x74, 0x65, 0x6e, 0x63, 0x69, 0xa2, 0x6e])),
    ).toBe("¡Atención");
  });
});
