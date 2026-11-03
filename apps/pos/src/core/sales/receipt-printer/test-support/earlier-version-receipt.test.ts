import { describe, expect, it } from "vitest";
import { EscPosWriter } from "../../../platform/escpos/escpos-writer";
import { printoutOf } from "../../../platform/escpos/test-support/escpos-printout";
import { RECEIPT_LOGO } from "../receipt-logo";
import { earlierVersionReceipt } from "./earlier-version-receipt";

function logoRows(): Uint8Array {
  return Uint8Array.from(
    RECEIPT_LOGO.rows.flatMap((encoded) => Array.from(Buffer.from(encoded, "base64"))),
  );
}

function current() {
  const head = new EscPosWriter();
  head.initialize();
  head.rasterImage(
    { widthDots: RECEIPT_LOGO.widthDots, heightDots: RECEIPT_LOGO.heightDots, rows: logoRows() },
    { bottomMarginDots: 16 },
  );
  head.small(["Av. Belgrano 1450"]);
  const body = new EscPosWriter();
  body.qr("https://example.test/?p=1", { correction: "M", moduleDots: 4 });
  body.blankImage(5);
  body.small(["Comprobante autorizado"]);
  return { templateVersion: "3", head: head.bytes(), body: body.bytes() };
}

const QR = [
  "[align center]",
  "[qr model 2]",
  "[qr module 4]",
  "[qr correction M]",
  "[qr store https://example.test/?p=1]",
  "[qr print]",
  "[align left]",
];

describe("a receipt as an earlier version of the template stored it", () => {
  it("has the first version's logo between two feeds and a feed below each QR", () => {
    const stored = earlierVersionReceipt(current(), "1");

    expect(stored.templateVersion).toBe("1");
    expect(printoutOf(stored.head).text).toBe(
      [
        "[init]",
        "[codepage PC850]",
        "[feed dots 14]",
        "[logo 576x280]",
        "[feed dots 9]",
        "[small]Av. Belgrano 1450[/small]",
      ].join("\n"),
    );
    expect(printoutOf(stored.body).text).toBe(
      [...QR, "[feed dots 5]", "[small]Comprobante autorizado[/small]"].join("\n"),
    );
  });

  it("has the second version's logo in two strips with a feed below it and a feed below each QR", () => {
    const stored = earlierVersionReceipt(current(), "2");

    expect(stored.templateVersion).toBe("2");
    expect(printoutOf(stored.head).text).toBe(
      [
        "[init]",
        "[codepage PC850]",
        "[logo 576x255]",
        "[logo 576x25]",
        "[feed dots 16]",
        "[small]Av. Belgrano 1450[/small]",
      ].join("\n"),
    );
    expect(printoutOf(stored.body).text).toBe(
      [...QR, "[feed dots 5]", "[small]Comprobante autorizado[/small]"].join("\n"),
    );
  });
});
