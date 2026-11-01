export type Cell =
  | { kind: "text"; value: string }
  | { kind: "count"; value: number }
  | { kind: "money"; cents: number }
  | { kind: "day"; day: string }
  | { kind: "instant"; instant: string; timeZone: string }
  | { kind: "weight"; thousandths: number }
  | { kind: "percent"; percent: number }
  | { kind: "usd"; nanoUsd: number }
  | { kind: "empty" };

export type Sheet = { name: string; header: string[]; rows: Cell[][] };

export type Workbook = { sheets: Sheet[] };

export const cell = {
  text: (value: string): Cell => ({ kind: "text", value }),
  count: (value: number): Cell => ({ kind: "count", value }),
  money: (cents: number): Cell => ({ kind: "money", cents }),
  day: (day: string): Cell => ({ kind: "day", day }),
  instant: (instant: string, timeZone: string): Cell => ({ kind: "instant", instant, timeZone }),
  weight: (thousandths: number): Cell => ({ kind: "weight", thousandths }),
  percent: (percent: number): Cell => ({ kind: "percent", percent }),
  usd: (nanoUsd: number): Cell => ({ kind: "usd", nanoUsd }),
  empty: (): Cell => ({ kind: "empty" }),
};
