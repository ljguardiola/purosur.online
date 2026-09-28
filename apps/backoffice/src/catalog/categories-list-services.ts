import { createCategory, editCategory, fetchCategories } from "./categories-api";

export type CategoriesListScreenServices = {
  fetchCategories: typeof fetchCategories;
  createCategory: typeof createCategory;
  editCategory: typeof editCategory;
};

export const defaultCategoriesListScreenServices: CategoriesListScreenServices = {
  fetchCategories,
  createCategory,
  editCategory,
};
