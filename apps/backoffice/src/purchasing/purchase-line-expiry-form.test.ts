import { CalendarDate } from "@internationalized/date";
import { purchaseLineExpiryCorrectionBodySchema } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  PURCHASE_LINE_EXPIRY_FIELDS,
  PURCHASE_LINE_EXPIRY_MESSAGES,
  purchaseLineExpiryRequestFrom,
  purchaseLineExpiryValuesOf,
} from "./purchase-line-expiry-form";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";

const [lineDeMiel] = compraDeMiel.lines;
const [lineDeAvena] = compraDeAvena.lines;

describe("purchaseLineExpiryValuesOf", () => {
  it("starts from the line's expiry date", () => {
    expect(lineDeMiel && purchaseLineExpiryValuesOf(lineDeMiel)).toEqual({
      expiresOn: new CalendarDate(2027, 1, 31),
    });
  });

  it("starts a line without expiry date empty", () => {
    expect(lineDeAvena && purchaseLineExpiryValuesOf(lineDeAvena)).toEqual({ expiresOn: null });
  });
});

describe("purchaseLineExpiryRequestFrom", () => {
  it.each([
    [new CalendarDate(2027, 11, 10), "2027-11-10"],
    [null, null],
  ])("sends %s as %s", (expiresOn, sent) => {
    const request = purchaseLineExpiryRequestFrom({ expiresOn });

    expect(request).toEqual({ expiresOn: sent });
    expect(purchaseLineExpiryCorrectionBodySchema.safeParse(request).success).toBe(true);
  });
});

describe("the expiry form's field and message", () => {
  it("lands the wire key on its field", () => {
    expect(PURCHASE_LINE_EXPIRY_FIELDS).toEqual({ expiresOn: "expiresOn" });
  });

  it("asks for a valid date", () => {
    expect(PURCHASE_LINE_EXPIRY_MESSAGES.expiresOn).toBe(
      "Ingresá una fecha de vencimiento válida.",
    );
  });
});
