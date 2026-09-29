import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const indexHtml = readFileSync(`${APP_ROOT}/index.html`, "utf8");

const linkedIcons = [...indexHtml.matchAll(/<link\b[^>]*>/g)]
  .map(([tag]) => tag)
  .filter((tag) => /\brel="icon"/.test(tag))
  .map((tag) => readFileSync(`${APP_ROOT}/public/${/\bhref="\/([^"]+)"/.exec(tag)?.[1]}`));

const faviconSvg = linkedIcons
  .map((icon) => icon.toString("utf8"))
  .find((text) => text.trimStart().startsWith("<svg"));
const faviconIco = linkedIcons.find(
  (icon) => icon.readUInt16LE(0) === 0 && icon.readUInt16LE(2) === 1,
);

describe("the backoffice tab icon", () => {
  it("links an isotype SVG with a square viewBox, so the icon is never stretched", () => {
    const viewBoxMatch = faviconSvg?.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);

    expect(viewBoxMatch?.[1]).toBeDefined();
    expect(Number(viewBoxMatch?.[1])).toBe(Number(viewBoxMatch?.[2]));
  });

  it("links a favicon.ico holding square 16, 32, and 48 px frames", () => {
    if (!faviconIco) {
      expect.fail("the page links no ICO icon");
    }

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
