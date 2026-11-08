import type { PagePart } from "../platform/page-parts";
import {
  type BackofficeAccess,
  canManageBatches,
  canManageRecipes,
} from "../shell/backoffice-access";

export type AssembliesSection = "recipes" | "batches";

export const ASSEMBLIES_SECTIONS: readonly PagePart<BackofficeAccess, AssembliesSection>[] = [
  { key: "recipes", isVisibleTo: canManageRecipes },
  { key: "batches", isVisibleTo: canManageBatches },
];

export const ASSEMBLIES_SECTION_TARGETS = {
  recipes: "/products/assemblies",
  batches: "/products/assemblies/batches",
} as const;
