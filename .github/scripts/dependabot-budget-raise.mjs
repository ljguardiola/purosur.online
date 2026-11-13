import { findBudgetViolations, holdsExactlyTheMeasures } from "./backoffice-download-budget.mjs";

const RAISE_CAP_BYTES = 2048;

export function decideBudgetRaise(measured, budget) {
  if (!holdsExactlyTheMeasures(budget) || measured.missing.length > 0) {
    return { kind: "refused", reasons: findBudgetViolations(measured, budget) };
  }
  if (findBudgetViolations(measured, budget).length === 0) return { kind: "within-budget" };

  const cap = { entry: budget.entry + RAISE_CAP_BYTES, total: budget.total + RAISE_CAP_BYTES };
  const overCap = findBudgetViolations(measured, cap);
  if (overCap.length > 0) return { kind: "over-cap", reasons: overCap };

  return { kind: "raise", budget: { entry: measured.entry, total: measured.total } };
}
