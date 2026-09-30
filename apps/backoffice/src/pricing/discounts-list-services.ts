import { fetchCategories } from "../catalog/categories-api";
import { fetchProducts } from "../catalog/products-api";
import { fetchTags } from "../catalog/tags-api";
import { createDiscount, fetchDiscounts } from "./discounts-api";
import type { NewDiscountModalServices } from "./new-discount-modal";

export type DiscountsListScreenServices = {
  fetchDiscounts: typeof fetchDiscounts;
  fetchProducts: typeof fetchProducts;
  fetchCategories: typeof fetchCategories;
  fetchTags: typeof fetchTags;
} & NewDiscountModalServices;

export const defaultDiscountsListScreenServices: DiscountsListScreenServices = {
  fetchDiscounts,
  fetchProducts,
  fetchCategories,
  fetchTags,
  createDiscount,
};
