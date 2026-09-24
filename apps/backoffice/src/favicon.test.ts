import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));
const indexHtml = readFileSync(`${APP_ROOT}/index.html`, "utf8");
const faviconSvg = readFileSync(`${APP_ROOT}/public/favicon.svg`, "utf8");
const faviconIco = readFileSync(`${APP_ROOT}/public/favicon.ico`);

describe("the backoffice tab icon", () => {
  it("links the isotype SVG from the document head, before any script tag", () => {
    const linkIndex = indexHtml.indexOf(
      '<link rel="icon" type="image/svg+xml" href="/favicon.svg"',
    );
    const scriptIndex = indexHtml.indexOf("<script");

    expect(linkIndex).toBeGreaterThan(-1);
    expect(linkIndex).toBeLessThan(scriptIndex);
  });

  it("also links favicon.ico, so a browser that ignores the SVG link still gets the isotype", () => {
    expect(indexHtml).toContain('<link rel="icon" href="/favicon.ico" sizes="32x32"');
  });

  it("ships an isotype SVG with a square viewBox, so the icon is never stretched", () => {
    const viewBoxMatch = faviconSvg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);

    expect(viewBoxMatch?.[1]).toBeDefined();
    expect(Number(viewBoxMatch?.[1])).toBe(Number(viewBoxMatch?.[2]));
  });

  it("ships the isotype in the brand colors, unchanged from the source design", () => {
    expect(faviconSvg).toContain('fill="#8ca38f"');
    expect(faviconSvg).toContain('fill="#9bb6c7"');
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
