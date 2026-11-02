import { concatenated, EscPosWriter } from "../../../platform/escpos/escpos-writer";
import { RECEIPT_LOGO } from "../receipt-logo";

const FIRST_VERSION_LOGO_TOP_FEED = [0x1b, 0x4a, 24];
const FIRST_VERSION_LOGO_BOTTOM_FEED = [0x1b, 0x4a, 16];

interface AroundTheLogo {
  beforeLogo?: (out: EscPosWriter) => void;
  afterLogo: (out: EscPosWriter) => void;
}

function written(write: (out: EscPosWriter) => void): Uint8Array {
  const out = new EscPosWriter();
  write(out);
  return out.bytes();
}

export function firstVersionHead({ beforeLogo, afterLogo }: AroundTheLogo): Uint8Array {
  const { widthDots, heightDots, rows } = RECEIPT_LOGO;
  const widthBytes = widthDots / 8;
  return concatenated([
    written((out) => {
      out.initialize();
      beforeLogo?.(out);
    }),
    Uint8Array.of(
      ...FIRST_VERSION_LOGO_TOP_FEED,
      0x1d,
      0x76,
      0x30,
      0,
      widthBytes & 0xff,
      widthBytes >> 8,
      heightDots & 0xff,
      heightDots >> 8,
    ),
    ...rows.map((encoded) => Uint8Array.from(Buffer.from(encoded, "base64"))),
    Uint8Array.of(...FIRST_VERSION_LOGO_BOTTOM_FEED),
    written(afterLogo),
  ]);
}
