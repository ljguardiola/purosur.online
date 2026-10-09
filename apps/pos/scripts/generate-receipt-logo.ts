import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const LOGO_WIDTH_DOTS = 384;
const OPAQUE_FROM = 128;
const LOGO_FILE = new URL("../../../packages/ui/src/assets/puro-sur-logo.svg", import.meta.url);

const image = new Resvg(readFileSync(LOGO_FILE, "utf8"), {
  fitTo: { mode: "width", value: LOGO_WIDTH_DOTS },
  font: { loadSystemFonts: false },
}).render();
const { pixels } = image;

const rows: string[] = [];
for (let y = 0; y < image.height; y += 1) {
  const bytes = Buffer.alloc(image.width / 8);
  for (let x = 0; x < image.width; x += 1) {
    if ((pixels[(y * image.width + x) * 4 + 3] ?? 0) >= OPAQUE_FROM) {
      bytes[x >> 3] = (bytes[x >> 3] ?? 0) | (0x80 >> (x & 7));
    }
  }
  rows.push(bytes.toString("base64"));
}

process.stdout.write(
  [
    "export const RECEIPT_LOGO = {",
    `  widthDots: ${image.width},`,
    `  heightDots: ${image.height},`,
    "  rows: [",
    ...rows.map((row) => `    "${row}",`),
    "  ],",
    "};",
    "",
  ].join("\n"),
);
