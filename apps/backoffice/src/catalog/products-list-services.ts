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
  reactivateProduct,
} from "./products-api";
import type { ReactivateProductModalServices } from "./reactivate-product-modal";
import { createTag, fetchTags } from "./tags-api";

export type ProductsListScreenServices = {
  fetchProducts: typeof fetchProducts;
  fetchCategories: typeof fetchCategories;
  fetchBrands: typeof fetchBrands;
  fetchTags: typeof fetchTags;
} & NewProductModalServices &
  EditProductModalServices &
  DeactivateProductModalServices &
  ReactivateProductModalServices &
  PrintLabelsModalServices;

export const defaultProductsListScreenServices: ProductsListScreenServices = {
  fetchProducts,
  createProduct,
  editProduct,
  deactivateProduct,
  reactivateProduct,
  fetchCategories,
  fetchBrands,
  fetchTags,
  createBrand,
  createTag,
  generateInternalBarcode,
  printLabels,
};
