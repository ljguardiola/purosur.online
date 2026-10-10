import { sortedItems, textOrder } from "@purosur/ui";

type CategoryOption = { value: string; label: string };

const categoryOrder = textOrder((category: CategoryOption) => category.label);

export function categoryFilterOptions(
  rows: readonly { categoryId: string; categoryName: string }[],
): [CategoryOption, ...CategoryOption[]] {
  const categories = new Map(rows.map((row) => [row.categoryId, row.categoryName]));
  const options = [...categories].map(([value, label]) => ({ value, label }));
  return [
    { value: "ALL", label: "Todas" },
    ...sortedItems(options, { order: categoryOrder, direction: "ascending" }),
  ];
}
