import { createCategory, fetchCategories } from "./categories-api";

export type CategoryCreationModalServices = {
  fetchCategories: typeof fetchCategories;
  createCategory: typeof createCategory;
};

export const defaultCategoryCreationModalServices: CategoryCreationModalServices = {
  fetchCategories,
  createCategory,
};
