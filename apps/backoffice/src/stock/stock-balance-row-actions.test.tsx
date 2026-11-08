import { expect, test, vi } from "vitest";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { accessWith } from "../shell/test-support/backoffice-access";
import { stockBalanceRowActions } from "./stock-balance-row-actions";
import { honey } from "./test-support/stock-fixtures";

function withKinds(
  access: BackofficeAccess,
  ...kinds: BackofficeAccess["stockMovementKinds"][number][]
): BackofficeAccess {
  return { ...access, stockMovementKinds: kinds };
}

function handlers() {
  return { count: vi.fn(), adjust: vi.fn(), registerLoss: vi.fn() };
}

function menuLabels(access: BackofficeAccess) {
  return stockBalanceRowActions(access, handlers())
    .menu(honey)
    ?.map((entry) => entry.label);
}

test("offers no action outside the row's menu", () => {
  expect(stockBalanceRowActions(accessWith("stock_counts"), handlers()).actions).toEqual([]);
});

test.each([
  [
    "every action",
    withKinds(accessWith("stock_counts"), "adjustment", "loss"),
    ["Contar", "Ajustar", "Registrar pérdida"],
  ],
  ["counting", accessWith("stock_counts"), ["Contar"]],
  ["adjusting", withKinds(accessWith(), "adjustment"), ["Ajustar"]],
  ["recording losses", withKinds(accessWith(), "loss"), ["Registrar pérdida"]],
] as const)("offers in the menu only what a person allowed %s may do", (_case, access, labels) => {
  expect(menuLabels(access)).toEqual(labels);
});

test("offers no menu to a person who can neither count nor move stock", () => {
  expect(menuLabels(accessWith("stock_balances"))).toBeUndefined();
});

test("each action acts on the row's product", () => {
  const actions = handlers();
  const menu = stockBalanceRowActions(
    withKinds(accessWith("stock_counts"), "adjustment", "loss"),
    actions,
  ).menu(honey);

  for (const entry of menu ?? []) {
    entry.onAction();
  }

  expect(actions.count).toHaveBeenCalledExactlyOnceWith(honey);
  expect(actions.adjust).toHaveBeenCalledExactlyOnceWith(honey);
  expect(actions.registerLoss).toHaveBeenCalledExactlyOnceWith(honey);
});
