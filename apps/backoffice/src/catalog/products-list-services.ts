import { createBrand, fetchBrands } from "./brands-api";
import { fetchCategories } from "./categories-api";
import type { DeactivateProductModalServices } from "./deactivate-product-modal";
import type { EditProductModalServices } from "./edit-product-modal";
import type { NewProductModalServices } from "./new-product-modal";
import type { PrintLabelsModalServices } from "./print-labels-modal";
import {
  createProduct,
  deactivateProduct,
  editProduct,
  fetchProducts,
  generateInternalBarcode,
  printLabels,
} from "./products-api";
import { createTag, fetchTags } from "./tags-api";

export type ProductsListScreenServices = {
  fetchProducts: typeof fetchProducts;
  fetchCategories: typeof fetchCategories;
  fetchBrands: typeof fetchBrands;
  fetchTags: typeof fetchTags;
} & NewProductModalServices &
  EditProductModalServices &
  DeactivateProductModalServices &
  PrintLabelsModalServices;

export const defaultProductsListScreenServices: ProductsListScreenServices = {
  fetchProducts,
  createProduct,
  editProduct,
  deactivateProduct,
  fetchCategories,
  fetchBrands,
  fetchTags,
  createBrand,
  createTag,
  generateInternalBarcode,
  printLabels,
};
