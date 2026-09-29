import type { CategorySummary } from "@purosur/contracts";

export const groceries: CategorySummary = {
  id: "category-1",
  name: "Almacén",
  version: 1,
  parentId: null,
};
export const spreads: CategorySummary = {
  id: "category-2",
  name: "Untables",
  version: 1,
  parentId: "category-1",
};
export const jams: CategorySummary = {
  id: "category-3",
  name: "Mermeladas",
  version: 1,
  parentId: "category-2",
};
export const drinks: CategorySummary = {
  id: "category-4",
  name: "Bebidas",
  version: 3,
  parentId: null,
};
