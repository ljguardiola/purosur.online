import { describe, expect, it } from "vitest";
import type { ReturnDraft, ReturnDraftLine } from "./return-form";
import {
  checkLine,
  draftLineOf,
  draftLinesFor,
  EMPTY_RETURN_DRAFT,
  EMPTY_RETURN_FORM,
  isRefundTextInvalid,
  refundsOf,
  refundTextsFor,
  returnRequestFrom,
  returnRequestSchema,
  uncheckLine,
} from "./return-form";
import type { SaleLineForReturn } from "./return-sale";
import { CASH, HONEY, NIBS, PASTA, SALE, TRANSFER } from "./test-support/sale-for-return";

function withLine(
  draft: ReturnDraft,
  line: SaleLineForReturn,
  edit: Partial<ReturnDraftLine>,
): ReturnDraft {
  return { ...draft, [line.id]: { ...draftLineOf(line), ...edit } };
}

const OTHER_CASH = { ...CASH, payment_id: "pay-cash-2", amount: 500_000, remaining: 500_000 };

describe("a return draft", () => {
  it("starts with no line", () => {
    expect(EMPTY_RETURN_DRAFT).toEqual({});
    expect(draftLinesFor(SALE, EMPTY_RETURN_DRAFT)).toEqual([]);
  });

  it("takes a checked unit line whole, for a change of mind refunded and put back on sale", () => {
    const draft = checkLine(EMPTY_RETURN_DRAFT, PASTA);

    expect(draft).toEqual({
      [PASTA.id]: {
        quantity: "3",
        reason: "change_of_mind",
        disposition: "restock",
        resolution: "refund",
      },
    });
  });

  it("takes a checked weighed line whole, as the weight is typed", () => {
    expect(checkLine(EMPTY_RETURN_DRAFT, NIBS)).toEqual({
      [NIBS.id]: {
        quantity: "0,350",
        reason: "change_of_mind",
        disposition: "restock",
        resolution: "refund",
      },
    });
  });

  it("has no line, however it is named, that was not checked", () => {
    const inherited = { ...PASTA, id: "constructor" };

    expect(draftLinesFor({ ...SALE, lines: [inherited] }, EMPTY_RETURN_DRAFT)).toEqual([]);
  });

  it("forgets a line that is unchecked, and only that one", () => {
    const draft = checkLine(checkLine(EMPTY_RETURN_DRAFT, PASTA), NIBS);

    expect(Object.keys(uncheckLine(draft, PASTA.id))).toEqual([NIBS.id]);
  });

  it("asks the core about the checked lines in the order of the sale", () => {
    const draft = withLine(
      withLine(EMPTY_RETURN_DRAFT, NIBS, {
        quantity: "0,200",
        reason: "defective",
        disposition: "discard",
        resolution: "exchange",
      }),
      PASTA,
      { quantity: "2", reason: "change_of_mind", disposition: "restock" },
    );

    expect(draftLinesFor(SALE, draft)).toEqual([
      {
        sale_line_id: PASTA.id,
        quantity: 2,
        reason: "change_of_mind",
        disposition: "restock",
        resolution: "refund",
      },
      {
        sale_line_id: NIBS.id,
        quantity: 200,
        reason: "defective",
        disposition: "discard",
        resolution: "exchange",
      },
    ]);
  });

  it("asks for a quantity of nothing when what is typed is not a quantity", () => {
    const draft = withLine(checkLine(EMPTY_RETURN_DRAFT, NIBS), PASTA, { quantity: "dos" });
    const weighed = withLine(draft, NIBS, { quantity: "0,3501" });

    expect(draftLinesFor(SALE, weighed).map(({ quantity }) => quantity)).toEqual([0, 0]);
  });

  it("asks for all that remains of a line that goes back whole for the chosen reason, whatever is typed", () => {
    const draft = withLine(EMPTY_RETURN_DRAFT, HONEY, {
      quantity: "1",
      reason: "change_of_mind",
    });

    expect(draftLinesFor(SALE, draft).map(({ quantity }) => quantity)).toEqual([2]);
  });

  it("asks for what is typed of a line that goes back whole only for another reason", () => {
    const draft = withLine(EMPTY_RETURN_DRAFT, HONEY, {
      quantity: "1",
      reason: "defective",
    });

    expect(draftLinesFor(SALE, draft).map(({ quantity }) => quantity)).toEqual([1]);
  });

  it("asks for all that remains of a line that goes back whole for a change of mind as soon as it is checked", () => {
    const draft = checkLine(EMPTY_RETURN_DRAFT, HONEY);

    expect(draftLinesFor(SALE, draft).map(({ quantity }) => quantity)).toEqual([2]);
  });

  it("leaves out a checked line the sale no longer has", () => {
    const draft = checkLine(EMPTY_RETURN_DRAFT, { ...PASTA, id: "line-gone" });

    expect(draftLinesFor(SALE, draft)).toEqual([]);
  });
});

describe("the refund shown for each payment", () => {
  it("puts all the refundable total in the first payment that can be refunded", () => {
    const spent = { ...TRANSFER, eligible: false, ineligible_reason: "nothing_left" } as const;
    expect(refundTextsFor([spent, OTHER_CASH, CASH], 1_393_500, {})).toEqual([
      { payment: spent, text: "" },
      { payment: OTHER_CASH, text: "13.935,00" },
      { payment: CASH, text: "" },
    ]);
  });

  it("puts it in a payment that is not cash when it is the first that can be refunded", () => {
    expect(refundTextsFor([TRANSFER, CASH], 500_000, {}).map(({ text }) => text)).toEqual([
      "5.000,00",
      "",
    ]);
  });

  it("puts nothing in any payment while there is nothing to refund", () => {
    expect(refundTextsFor([CASH], 0, {})).toEqual([{ payment: CASH, text: "" }]);
  });

  it("ignores what was typed for no payment, however a payment is named", () => {
    const inherited = { ...CASH, payment_id: "constructor" };

    expect(refundTextsFor([inherited], 0, {})).toEqual([{ payment: inherited, text: "" }]);
  });

  it("takes what the cashier typed instead", () => {
    expect(
      refundTextsFor([CASH, OTHER_CASH], 1_000_000, {
        [CASH.payment_id]: "6.000,00",
        [OTHER_CASH.payment_id]: "",
      }).map(({ text }) => text),
    ).toEqual(["6.000,00", ""]);
  });
});

describe("an amount typed for a payment", () => {
  it.each(["", "  ", "1.500,00", "0,50"])(
    "is not refused when it reads as an amount: %j",
    (text) => {
      expect(isRefundTextInvalid(text)).toBe(false);
    },
  );

  it.each(["diez", "99.999.999.999.999.999.999,00"])(
    "is refused when the core could not read it as an amount: %j",
    (text) => {
      expect(isRefundTextInvalid(text)).toBe(true);
    },
  );
});

describe("the refunds asked of the core", () => {
  it("are the payments with something to refund, read as amounts", () => {
    const texts = refundTextsFor([CASH, OTHER_CASH], 1_000_000, {
      [OTHER_CASH.payment_id]: "100,50",
      [CASH.payment_id]: "0",
    });

    expect(refundsOf(texts)).toEqual([{ payment_id: OTHER_CASH.payment_id, amount: 10_050 }]);
  });

  it("leave out a payment left empty", () => {
    expect(refundsOf([{ payment: CASH, text: "" }])).toEqual([]);
  });

  it("carry an amount typed badly as no amount at all, so it is never asked for as nothing", () => {
    expect(refundsOf([{ payment: CASH, text: "diez" }])).toEqual([
      { payment_id: CASH.payment_id, amount: Number.NaN },
    ]);
  });
});

describe("the request a return is completed with", () => {
  it("carries the checked lines and the refund of each payment", () => {
    const request = returnRequestFrom(SALE, 970_000, {
      lines: withLine(EMPTY_RETURN_DRAFT, PASTA, {
        reason: "change_of_mind",
        disposition: "restock",
      }),
      refunds: {},
    });

    expect(request).toEqual({
      lines: [
        {
          sale_line_id: PASTA.id,
          quantity: 3,
          reason: "change_of_mind",
          disposition: "restock",
          resolution: "refund",
        },
      ],
      refunds: [{ payment_id: CASH.payment_id, amount: 970_000 }],
    });
    expect(returnRequestSchema.safeParse(request).success).toBe(true);
  });

  it("starts with no line and no refund", () => {
    expect(returnRequestFrom(SALE, 0, EMPTY_RETURN_FORM)).toEqual({ lines: [], refunds: [] });
  });

  it("is refused when an amount is typed badly", () => {
    const request = returnRequestFrom(SALE, 970_000, {
      lines: checkLine(EMPTY_RETURN_DRAFT, PASTA),
      refunds: { [CASH.payment_id]: "diez" },
    });

    expect(returnRequestSchema.safeParse(request).error?.issues[0]?.path).toEqual([
      "refunds",
      0,
      "amount",
    ]);
  });
});
