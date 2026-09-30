import { fetchCategories } from "../catalog/categories-api";
import { fetchProducts } from "../catalog/products-api";
import { fetchTags } from "../catalog/tags-api";
import { createDiscount, editDiscount, fetchDiscounts } from "./discounts-api";
import type { EditDiscountModalServices } from "./edit-discount-modal";
import type { NewDiscountModalServices } from "./new-discount-modal";

export type DiscountsListScreenServices = {
  fetchDiscounts: typeof fetchDiscounts;
  fetchProducts: typeof fetchProducts;
  fetchCategories: typeof fetchCategories;
  fetchTags: typeof fetchTags;
} & NewDiscountModalServices &
  EditDiscountModalServices;

export const defaultDiscountsListScreenServices: DiscountsListScreenServices = {
  fetchDiscounts,
  fetchProducts,
  fetchCategories,
  fetchTags,
  createDiscount,
  editDiscount,
};
