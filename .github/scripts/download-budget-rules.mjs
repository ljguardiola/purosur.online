export const MEASURES = ["entry", "total"];
export const BUDGET_SHAPE = `the budget must hold exactly ${MEASURES.join(" and ")}, each a positive whole number of bytes`;

export function holdsExactlyTheMeasures(budget) {
  if (typeof budget !== "object" || budget === null || Array.isArray(budget)) return false;
  return (
    Object.keys(budget).length === MEASURES.length &&
    MEASURES.every(
      (measure) =>
        Object.hasOwn(budget, measure) && Number.isInteger(budget[measure]) && budget[measure] > 0,
    )
  );
}

export function findBudgetViolations(measured, budget) {
  if (!holdsExactlyTheMeasures(budget)) {
    return [BUDGET_SHAPE];
  }
  const violations = measured.missing.map(
    (file) => `index.html references ${file}, which the build did not produce`,
  );
  for (const measure of MEASURES) {
    if (measured[measure] > budget[measure]) {
      violations.push(
        `${measure} is ${measured[measure]} bytes gzip, over its budget of ${budget[measure]}`,
      );
    }
  }
  return violations;
}
