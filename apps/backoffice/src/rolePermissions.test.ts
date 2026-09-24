import type { PermissionKey } from "@purosur/contracts";
import { expect, test } from "vitest";
import { withOneAlertView } from "./rolePermissions";

test("keeps only the broader alert view when both alert views are held", () => {
  const keys: PermissionKey[] = [
    "view_stock_balances",
    "view_branch_alerts",
    "view_all_alerts",
    "dismiss_alerts_manually",
  ];

  expect([...withOneAlertView(keys)]).toEqual([
    "view_stock_balances",
    "view_all_alerts",
    "dismiss_alerts_manually",
  ]);
});

test("leaves a selection holding a single alert view unchanged", () => {
  expect([...withOneAlertView(["view_branch_alerts", "reprint_receipt"])]).toEqual([
    "view_branch_alerts",
    "reprint_receipt",
  ]);
  expect([...withOneAlertView(["view_all_alerts"])]).toEqual(["view_all_alerts"]);
});

test("leaves a selection holding no alert view unchanged", () => {
  expect([...withOneAlertView(["reprint_receipt"])]).toEqual(["reprint_receipt"]);
});
