import type { CategorySummary } from "@purosur/contracts";

export const groceries: CategorySummary = {
  id: "ca7e0000-0000-4000-8000-000000000001",
  name: "Almacén",
  version: 1,
  parentId: null,
};
export const spreads: CategorySummary = {
  id: "ca7e0000-0000-4000-8000-000000000002",
  name: "Untables",
  version: 1,
  parentId: "ca7e0000-0000-4000-8000-000000000001",
};
export const jams: CategorySummary = {
  id: "ca7e0000-0000-4000-8000-000000000003",
  name: "Mermeladas",
  version: 1,
  parentId: "ca7e0000-0000-4000-8000-000000000002",
};
export const drinks: CategorySummary = {
  id: "ca7e0000-0000-4000-8000-000000000004",
  name: "Bebidas",
  version: 3,
  parentId: null,
};
