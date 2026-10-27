import { describe, expect, it } from "vitest";
import {
  changeLine,
  checkLine,
  draftLinesFor,
  EMPTY_RETURN_DRAFT,
  uncheckLine,
} from "./return-draft";
import { HONEY, NIBS, PASTA, SALE } from "./test-support/sale-for-return";

describe("a return draft", () => {
  it("starts with no line", () => {
    expect(EMPTY_RETURN_DRAFT).toEqual({});
    expect(draftLinesFor(SALE, EMPTY_RETURN_DRAFT)).toEqual([]);
  });

  it("takes a checked unit line whole, with no reason and no destination chosen", () => {
    const draft = checkLine(EMPTY_RETURN_DRAFT, PASTA);

    expect(draft).toEqual({ [PASTA.id]: { quantity: "3", reason: null, disposition: null } });
  });

  it("takes a checked weighed line whole, as the weight is typed", () => {
    expect(checkLine(EMPTY_RETURN_DRAFT, NIBS)).toEqual({
      [NIBS.id]: { quantity: "0,350", reason: null, disposition: null },
    });
  });

  it("forgets a line that is unchecked, and only that one", () => {
    const draft = checkLine(checkLine(EMPTY_RETURN_DRAFT, PASTA), NIBS);

    expect(Object.keys(uncheckLine(draft, PASTA.id))).toEqual([NIBS.id]);
  });

  it("changes only what is asked of one line", () => {
    const draft = changeLine(checkLine(EMPTY_RETURN_DRAFT, PASTA), PASTA.id, { reason: "defective" });

    expect(draft[PASTA.id]).toEqual({ quantity: "3", reason: "defective", disposition: null });
  });

  it("changes nothing in a line that is not checked", () => {
    expect(changeLine(EMPTY_RETURN_DRAFT, PASTA.id, { reason: "defective" })).toEqual({});
  });

  it("asks the core about the checked lines in the order of the sale", () => {
    const draft = changeLine(
      changeLine(checkLine(checkLine(EMPTY_RETURN_DRAFT, NIBS), PASTA), NIBS.id, {
        quantity: "0,200",
        reason: "defective",
        disposition: "discard",
      }),
      PASTA.id,
      { quantity: "2", reason: "change_of_mind", disposition: "restock" },
    );

    expect(draftLinesFor(SALE, draft)).toEqual([
      { sale_line_id: PASTA.id, quantity: 2, reason: "change_of_mind", disposition: "restock" },
      { sale_line_id: NIBS.id, quantity: 200, reason: "defective", disposition: "discard" },
    ]);
  });

  it("asks for a quantity of nothing when what is typed is not a quantity", () => {
    const draft = changeLine(checkLine(checkLine(EMPTY_RETURN_DRAFT, PASTA), NIBS), PASTA.id, {
      quantity: "dos",
    });
    const weighed = changeLine(draft, NIBS.id, { quantity: "0,3501" });

    expect(draftLinesFor(SALE, weighed).map(({ quantity }) => quantity)).toEqual([0, 0]);
  });

  it("asks for all that remains of a line that goes back whole, whatever is typed", () => {
    const draft = changeLine(checkLine(EMPTY_RETURN_DRAFT, HONEY), HONEY.id, { quantity: "1" });

    expect(draftLinesFor(SALE, draft).map(({ quantity }) => quantity)).toEqual([2]);
  });

  it("leaves out a checked line the sale no longer has", () => {
    const draft = checkLine(EMPTY_RETURN_DRAFT, { ...PASTA, id: "line-gone" });

    expect(draftLinesFor(SALE, draft)).toEqual([]);
  });
});
