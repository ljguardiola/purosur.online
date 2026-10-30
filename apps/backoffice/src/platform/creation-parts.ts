import type { CategorySummary, ProductSummary } from "@purosur/contracts";
import type { ComponentType } from "react";
import type { RoleSummary } from "./roles-api";

export type CreatedProduct = ProductSummary & { brandName: string | null };

export type CreationModalProps<Created> = {
  open: boolean;
  initialName: string;
  onCreated: (created: Created) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export type CategoryCreationModal = ComponentType<CreationModalProps<CategorySummary>>;
export type ProductCreationModal = ComponentType<CreationModalProps<CreatedProduct>>;
export type RoleCreationModal = ComponentType<CreationModalProps<RoleSummary>>;
