import { sortedItems, textOrder } from "@purosur/ui";
import type { ReactNode } from "react";
import { ScreenTitle } from "../shell/screen-title";

export function StockTopBar({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
      <div className="flex flex-col justify-center">
        <p className="text-text-subtle text-detail">Stock</p>
        <ScreenTitle>{title}</ScreenTitle>
      </div>
      {action}
    </div>
  );
}

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
