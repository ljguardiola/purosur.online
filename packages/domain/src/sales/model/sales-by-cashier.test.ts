import { describe, expect, it } from "vitest";
import { cashierSalesTotals, salesOfCashiers } from "./sales-by-cashier.js";

const cashier = (
  cashierId: string,
  name: string | null,
  sessions: number,
  salesCount: number,
  total: number,
) => ({ cashierId, name, sessions, salesCount, total });

describe("salesOfCashiers", () => {
  it("adds the average ticket of each cashier", () => {
    expect(salesOfCashiers([cashier("u1", "Ana", 2, 3, 10_000)])).toEqual([
      {
        cashierId: "u1",
        name: "Ana",
        sessions: 2,
        salesCount: 3,
        total: 10_000,
        averageTicket: 3_333,
      },
    ]);
  });

  it("has no average ticket for a cashier without sales", () => {
    expect(salesOfCashiers([cashier("u1", "Ana", 0, 0, 0)])[0]?.averageTicket).toBeNull();
  });

  it("orders by the number of sales, most first, before the amount", () => {
    const ids = salesOfCashiers([
      cashier("u1", "Ana", 1, 2, 90_000),
      cashier("u2", "Beto", 1, 5, 1_000),
      cashier("u3", "Carla", 1, 3, 50_000),
    ]).map((row) => row.cashierId);

    expect(ids).toEqual(["u2", "u3", "u1"]);
  });

  it("orders cashiers with the same number of sales by amount, most first", () => {
    const ids = salesOfCashiers([
      cashier("u1", "Ana", 1, 4, 1_000),
      cashier("u2", "Beto", 1, 4, 3_000),
      cashier("u3", "Carla", 1, 4, 2_000),
    ]).map((row) => row.cashierId);

    expect(ids).toEqual(["u2", "u3", "u1"]);
  });

  it("orders a tie of sales and amount by name, comparing code units", () => {
    const names = salesOfCashiers([
      cashier("u1", "Ángel", 1, 1, 100),
      cashier("u2", "Zoe", 1, 1, 100),
    ]).map((row) => row.name);

    expect(names).toEqual(["Zoe", "Ángel"]);
  });

  it("puts an uppercase name before a lowercase one, as code units do", () => {
    const names = salesOfCashiers([
      cashier("u1", "a", 1, 1, 100),
      cashier("u2", "B", 1, 1, 100),
    ]).map((row) => row.name);

    expect(names).toEqual(["B", "a"]);
  });

  it("puts a cashier without a name after the named ones on a tie", () => {
    const ids = salesOfCashiers([
      cashier("u1", null, 1, 1, 100),
      cashier("u2", "Zoe", 1, 1, 100),
      cashier("u3", null, 1, 1, 100),
    ]).map((row) => row.cashierId);

    expect(ids).toEqual(["u2", "u1", "u3"]);
  });

  it("orders the last tie by cashier id, comparing code units", () => {
    const ids = salesOfCashiers([
      cashier("a1", "Ana", 1, 1, 100),
      cashier("B1", "Ana", 1, 1, 100),
    ]).map((row) => row.cashierId);

    expect(ids).toEqual(["B1", "a1"]);
  });

  it("orders unnamed cashiers by cashier id, comparing code units", () => {
    const ids = salesOfCashiers([
      cashier("a1", null, 1, 1, 100),
      cashier("B1", null, 1, 1, 100),
    ]).map((row) => row.cashierId);

    expect(ids).toEqual(["B1", "a1"]);
  });

  it("orders the same whatever order the rows arrive in", () => {
    const rows = [
      cashier("u1", "Ana", 1, 1, 100),
      cashier("u2", "Beto", 1, 1, 100),
      cashier("u3", null, 1, 1, 100),
    ];

    expect(salesOfCashiers([...rows].reverse())).toEqual(salesOfCashiers(rows));
  });
});

describe("cashierSalesTotals", () => {
  it("counts the cashiers and adds their sales and amount", () => {
    const rows = salesOfCashiers([
      cashier("u1", "Ana", 2, 3, 10_000),
      cashier("u2", "Beto", 1, 1, 5_000),
    ]);

    expect(cashierSalesTotals(rows)).toEqual({
      cashiers: 2,
      salesCount: 4,
      total: 15_000,
      averageTicket: 3_750,
    });
  });

  it("has no average ticket without sales", () => {
    expect(cashierSalesTotals([])).toEqual({
      cashiers: 0,
      salesCount: 0,
      total: 0,
      averageTicket: null,
    });
  });
});
