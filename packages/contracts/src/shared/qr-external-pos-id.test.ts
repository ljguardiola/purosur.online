import { describe, expect, it } from "vitest";
import { qrExternalPosIdSchema } from "./qr-external-pos-id.js";

const EXTERNAL_POS_ID = "CAJA1_STORE_POS";
const MESSAGE = "external_pos_id must be a QR point of sale id without spaces";

describe("qrExternalPosIdSchema", () => {
  it("reads a QR point of sale id", () => {
    expect(qrExternalPosIdSchema.parse(EXTERNAL_POS_ID)).toBe(EXTERNAL_POS_ID);
  });

  it("drops the whitespace around the id", () => {
    expect(qrExternalPosIdSchema.parse(`  ${EXTERNAL_POS_ID}\n`)).toBe(EXTERNAL_POS_ID);
  });

  it.each(["", "   ", "CAJA 1", 7, null, undefined])("refuses %j", (value) => {
    const result = qrExternalPosIdSchema.safeParse(value);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(MESSAGE);
  });
});
