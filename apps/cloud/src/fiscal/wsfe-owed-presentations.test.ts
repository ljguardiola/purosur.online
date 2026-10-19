import { describe, expect, it } from "vitest";
import { owedPresentationsOf } from "./wsfe-owed-presentations.js";

const OWED_CODE = 15_014;

function message(entries: string): { code: number; message: string } {
  return {
    code: OWED_CODE,
    message: `El contribuyente adeuda la presentacion de 2 quincenas consecutivas o 4 alternadas: ${entries}`,
  };
}

describe("owedPresentationsOf", () => {
  it("reads one presentation per period;order;pointOfSale entry, whatever separates them", () => {
    expect(
      owedPresentationsOf([message("202609;1;4|202608;2;9"), message("202607;1;12, 202606;2;3")]),
    ).toEqual([
      { pointOfSaleNumber: 4, fortnight: { start: "2026-09-01", end: "2026-09-15" } },
      { pointOfSaleNumber: 9, fortnight: { start: "2026-08-16", end: "2026-08-31" } },
      { pointOfSaleNumber: 12, fortnight: { start: "2026-07-01", end: "2026-07-15" } },
      { pointOfSaleNumber: 3, fortnight: { start: "2026-06-16", end: "2026-06-30" } },
    ]);
  });

  it("reads the second half of February by the month's real length", () => {
    expect(owedPresentationsOf([message("202402;2;1")])).toEqual([
      { pointOfSaleNumber: 1, fortnight: { start: "2024-02-16", end: "2024-02-29" } },
    ]);
  });

  it("lists a presentation once however many times it is named", () => {
    expect(owedPresentationsOf([message("202609;1;4|202609;1;4"), message("202609;1;4")])).toEqual([
      { pointOfSaleNumber: 4, fortnight: { start: "2026-09-01", end: "2026-09-15" } },
    ]);
  });

  it("lists the same fortnight of two points of sale separately", () => {
    expect(owedPresentationsOf([message("202609;1;4|202609;1;5")])).toHaveLength(2);
  });

  it("ignores any other observation", () => {
    expect(
      owedPresentationsOf([
        { code: 15_008, message: "202609;1;4" },
        { code: 602, message: "" },
      ]),
    ).toEqual([]);
  });

  it.each([
    ["an order other than 1 or 2", "202609;3;4"],
    ["a month other than 01 to 12", "202613;1;4"],
    ["a month of zero", "202600;1;4"],
    ["a period of fewer than six digits", "20269;1;4"],
    ["no point of sale", "202609;1;"],
    ["no entry", "sin quincenas"],
  ])("ignores an entry with %s", (_case, entries) => {
    expect(owedPresentationsOf([message(entries)])).toEqual([]);
  });

  it("keeps the valid entries beside a malformed one", () => {
    expect(owedPresentationsOf([message("202613;1;4|202609;2;7")])).toEqual([
      { pointOfSaleNumber: 7, fortnight: { start: "2026-09-16", end: "2026-09-30" } },
    ]);
  });
});
