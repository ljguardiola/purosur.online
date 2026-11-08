import { expect, test } from "vitest";
import { countRegisteredNotice, movementRegisteredNotice } from "./stock-registered-notices";
import { almonds, honey, withoutBalance } from "./test-support/stock-fixtures";

const ALMONDS = withoutBalance(almonds);
const HONEY = withoutBalance(honey);

test("says a count corrected the balance, with the new balance to a person who sees balances", () => {
  const result = { balance: 12_150, superseded: false, expected: 12_400, delta: -250 };

  expect(countRegisteredNotice(ALMONDS, result, true)).toEqual({
    title: "Saldo corregido",
    description: "Almendras peladas queda en 12,150 kg.",
  });
  expect(countRegisteredNotice(ALMONDS, result, false)).toEqual({
    title: "Saldo corregido",
    description: "Almendras peladas: − 0,250 kg.",
  });
});

test("says a count found no difference, with the balance only to a person who sees balances", () => {
  const result = { balance: 24_000, superseded: false, expected: 24_000, delta: 0 };

  expect(countRegisteredNotice(HONEY, result, true)).toEqual({
    title: "Sin diferencia",
    description: "Miel pura de abeja 1 kg sigue en 24 u.",
  });
  expect(countRegisteredNotice(HONEY, result, false)).toEqual({
    title: "Sin diferencia",
    description: "Miel pura de abeja 1 kg sigue igual.",
  });
});

test("says a count a later count superseded left the balance as it was", () => {
  const result = { balance: 24_000, superseded: true, expected: 23_000, delta: 1_000 };

  expect(countRegisteredNotice(HONEY, result, true)).toEqual({
    title: "El recuento no cambió el saldo",
    description: "Hay un recuento posterior de Miel pura de abeja 1 kg: el saldo sigue en 24 u.",
  });
  expect(countRegisteredNotice(HONEY, result, false)).toEqual({
    title: "El recuento no cambió el saldo",
    description: "Hay un recuento posterior de Miel pura de abeja 1 kg.",
  });
});

test("says a movement updated the balance, with the new balance to a person who sees balances", () => {
  const result = { balance: 23_000, superseded: false };

  expect(movementRegisteredNotice(HONEY, result, -1_000, true)).toEqual({
    title: "Saldo actualizado",
    description: "Miel pura de abeja 1 kg queda en 23 u.",
  });
  expect(movementRegisteredNotice(HONEY, result, -1_000, false)).toEqual({
    title: "Saldo actualizado",
    description: "Miel pura de abeja 1 kg: − 1 u.",
  });
});

test("says a movement a later count superseded left the balance as it was", () => {
  const result = { balance: 24_000, superseded: true };

  expect(movementRegisteredNotice(HONEY, result, -1_000, true)).toEqual({
    title: "El movimiento no cambió el saldo",
    description: "Hay un recuento posterior de Miel pura de abeja 1 kg: el saldo sigue en 24 u.",
  });
  expect(movementRegisteredNotice(HONEY, result, -1_000, false)).toEqual({
    title: "El movimiento no cambió el saldo",
    description: "Hay un recuento posterior de Miel pura de abeja 1 kg.",
  });
});
