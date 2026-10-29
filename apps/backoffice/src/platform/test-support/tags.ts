import type { TagList, TagSummary } from "@purosur/contracts";

export const sinTacc: TagSummary = {
  id: "7a600000-0000-4000-8000-000000000001",
  name: "Sin TACC",
  active: true,
  version: 1,
  productCount: 34,
};
export const vegano: TagSummary = {
  id: "7a600000-0000-4000-8000-000000000002",
  name: "Vegano",
  active: true,
  version: 2,
  productCount: 18,
};
export const sinColorantes: TagSummary = {
  id: "7a600000-0000-4000-8000-000000000003",
  name: "Sin colorantes",
  active: false,
  version: 4,
  productCount: 3,
};
export const organico: TagSummary = {
  id: "7a600000-0000-4000-8000-000000000004",
  name: "Orgánico",
  active: true,
  version: 1,
  productCount: 1,
};

export function tagList(tags: TagSummary[], taggedProductCount = 0): TagList {
  return { tags, taggedProductCount };
}
