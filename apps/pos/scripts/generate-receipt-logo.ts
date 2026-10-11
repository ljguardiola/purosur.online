import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const LOGO_WIDTH_DOTS = 576;
const LOGO_HEIGHT_DOTS = 280;
const OPAQUE_FROM = 128;
const LOGO_FILE = new URL("../../../packages/ui/src/assets/puro-sur-logo.svg", import.meta.url);
const SVG = readFileSync(LOGO_FILE, "utf8");

function render(width: number) {
  return new Resvg(SVG, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } }).render();
}

function inkedBounds(image: ReturnType<typeof render>) {
  const { pixels, width, height } = image;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((pixels[(y * width + x) * 4 + 3] ?? 0) >= OPAQUE_FROM) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return { left, right, top, bottom };
}

const source = render(new Resvg(SVG).width);
const bounds = inkedBounds(source);
const scale = LOGO_HEIGHT_DOTS / (bounds.bottom - bounds.top + 1);
const image = render(Math.round(source.width * scale));
const { pixels, width: renderedWidth } = image;
const inkedLeft = Math.round(bounds.left * scale);
const inkedTop = Math.round(bounds.top * scale);
const inkedWidth = Math.min(
  Math.round((bounds.right - bounds.left + 1) * scale),
  LOGO_WIDTH_DOTS,
);
const offsetX = Math.floor((LOGO_WIDTH_DOTS - inkedWidth) / 2);

const rows: string[] = [];
for (let y = 0; y < LOGO_HEIGHT_DOTS; y += 1) {
  const bytes = Buffer.alloc(LOGO_WIDTH_DOTS / 8);
  for (let x = 0; x < inkedWidth; x += 1) {
    const alpha = pixels[((inkedTop + y) * renderedWidth + inkedLeft + x) * 4 + 3] ?? 0;
    if (alpha >= OPAQUE_FROM) {
      const dot = offsetX + x;
      bytes[dot >> 3] = (bytes[dot >> 3] ?? 0) | (0x80 >> (dot & 7));
    }
  }
  rows.push(bytes.toString("base64"));
}

process.stdout.write(
  [
    "export const RECEIPT_LOGO = {",
    `  widthDots: ${LOGO_WIDTH_DOTS},`,
    `  heightDots: ${LOGO_HEIGHT_DOTS},`,
    "  rows: [",
    ...rows.map((row) => `    "${row}",`),
    "  ],",
    "};",
    "",
  ].join("\n"),
);
