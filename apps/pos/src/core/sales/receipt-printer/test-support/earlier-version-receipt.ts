import type { StoredReceipt } from "@purosur/domain/sales/use-cases";
import { concatenated } from "../../../platform/escpos/escpos-writer";
import { RECEIPT_LOGO } from "../receipt-logo";

const RASTER_IMAGE = [0x1d, 0x76, 0x30, 0];
const RASTER_HEADER_BYTES = 8;
const QR_PRINT_THEN_LEFT_ALIGNMENT = [0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30, 0x1b, 0x61, 0];

interface EarlierVersion {
  logoBlock: (logoRows: Uint8Array) => Uint8Array;
  qrBottomFeedUnits: number;
}

function rasterHeader(widthBytes: number, heightDots: number): number[] {
  return [...RASTER_IMAGE, widthBytes & 0xff, widthBytes >> 8, heightDots & 0xff, heightDots >> 8];
}

const EARLIER_VERSIONS: Record<"1" | "2", EarlierVersion> = {
  "1": {
    logoBlock: (rows) =>
      concatenated([
        Uint8Array.of(0x1b, 0x4a, 24, ...rasterHeader(RECEIPT_LOGO.widthDots / 8, 280)),
        rows,
        Uint8Array.of(0x1b, 0x4a, 16),
      ]),
    qrBottomFeedUnits: 8,
  },
  "2": {
    logoBlock: (rows) => {
      const widthBytes = RECEIPT_LOGO.widthDots / 8;
      return concatenated([
        Uint8Array.of(...rasterHeader(widthBytes, 255)),
        rows.subarray(0, 255 * widthBytes),
        Uint8Array.of(...rasterHeader(widthBytes, 25)),
        rows.subarray(255 * widthBytes),
        Uint8Array.of(0x1b, 0x4a, 28),
      ]);
    },
    qrBottomFeedUnits: 9,
  },
};

function startsWith(bytes: Uint8Array, at: number, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => bytes[at + index] === byte);
}

function indexOf(bytes: Uint8Array, prefix: readonly number[], from = 0): number {
  for (let at = from; at <= bytes.length - prefix.length; at += 1) {
    if (startsWith(bytes, at, prefix)) return at;
  }
  return -1;
}

function rasterEnd(bytes: Uint8Array, start: number): number {
  const widthBytes = (bytes[start + 4] ?? 0) + (bytes[start + 5] ?? 0) * 256;
  const height = (bytes[start + 6] ?? 0) + (bytes[start + 7] ?? 0) * 256;
  return start + RASTER_HEADER_BYTES + widthBytes * height;
}

function headWithLogoBlock(head: Uint8Array, version: EarlierVersion): Uint8Array {
  const start = indexOf(head, RASTER_IMAGE);
  let end = start;
  while (startsWith(head, end, RASTER_IMAGE)) {
    end = rasterEnd(head, end);
  }
  const logoRows = concatenated(
    RECEIPT_LOGO.rows.map((encoded) => Uint8Array.from(Buffer.from(encoded, "base64"))),
  );
  return concatenated([head.subarray(0, start), version.logoBlock(logoRows), head.subarray(end)]);
}

function bodyWithQrBottomFeed(body: Uint8Array, version: EarlierVersion): Uint8Array {
  const chunks: Uint8Array[] = [];
  let from = 0;
  for (
    let at = indexOf(body, QR_PRINT_THEN_LEFT_ALIGNMENT);
    at !== -1;
    at = indexOf(body, QR_PRINT_THEN_LEFT_ALIGNMENT, from)
  ) {
    const marginStart = at + QR_PRINT_THEN_LEFT_ALIGNMENT.length;
    chunks.push(
      body.subarray(from, marginStart),
      Uint8Array.of(0x1b, 0x4a, version.qrBottomFeedUnits),
    );
    from = rasterEnd(body, marginStart);
  }
  chunks.push(body.subarray(from));
  return concatenated(chunks);
}

export function earlierVersionReceipt(
  current: StoredReceipt,
  templateVersion: "1" | "2",
): StoredReceipt {
  const version = EARLIER_VERSIONS[templateVersion];
  return {
    templateVersion,
    head: headWithLogoBlock(current.head, version),
    body: bodyWithQrBottomFeed(current.body, version),
  };
}
