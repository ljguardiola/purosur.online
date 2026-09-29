import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const faviconSvg = readFileSync(`${APP_ROOT}/public/favicon.svg`, "utf8");
const faviconIco = readFileSync(`${APP_ROOT}/public/favicon.ico`);

describe("the backoffice tab icon", () => {
  it("ships an isotype SVG with a square viewBox, so the icon is never stretched", () => {
    const viewBoxMatch = faviconSvg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);

    expect(viewBoxMatch?.[1]).toBeDefined();
    expect(Number(viewBoxMatch?.[1])).toBe(Number(viewBoxMatch?.[2]));
  });

  it("ships a favicon.ico holding square 16, 32, and 48 px frames", () => {
    // ICO header: 2 reserved bytes (0), a type field (1 = icon), then an image count; each
    // 16-byte directory entry that follows starts with its width and height in bytes 0 and 1.
    expect(faviconIco.readUInt16LE(0)).toBe(0);
    expect(faviconIco.readUInt16LE(2)).toBe(1);
    const imageCount = faviconIco.readUInt16LE(4);
    const frames: [number, number][] = [];
    for (let i = 0; i < imageCount; i++) {
      const entryOffset = 6 + i * 16;
      frames.push([faviconIco.readUInt8(entryOffset), faviconIco.readUInt8(entryOffset + 1)]);
    }

    expect(frames.sort(([a], [b]) => a - b)).toEqual([
      [16, 16],
      [32, 32],
      [48, 48],
    ]);
  });
});
