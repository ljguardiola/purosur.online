import { createBrand } from "../platform/brand-creation-api";
import { generateInternalBarcode } from "../platform/internal-barcodes-api";
import { createTag } from "../platform/tag-creation-api";
import { fetchBrands } from "./brands-api";
import { createCategory, fetchCategories } from "./categories-api";
import type { NewProductModalServices } from "./new-product-modal";
import { createProduct } from "./products-api";
import { fetchTags } from "./tags-api";

export type ProductCreationModalServices = {
  fetchCategories: typeof fetchCategories;
  fetchBrands: typeof fetchBrands;
  fetchTags: typeof fetchTags;
} & NewProductModalServices;

export const defaultProductCreationModalServices: ProductCreationModalServices = {
  fetchCategories,
  fetchBrands,
  fetchTags,
  createProduct,
  createBrand,
  createCategory,
  createTag,
  generateInternalBarcode,
};
