import { createBrand, fetchBrands } from "./brands-api";
import { fetchCategories } from "./categories-api";
import {
  createProduct,
  deactivateProduct,
  editProduct,
  fetchProducts,
  generateInternalBarcode,
  printLabels,
} from "./products-api";

export type ProductsListScreenServices = {
  fetchProducts: typeof fetchProducts;
  createProduct: typeof createProduct;
  editProduct: typeof editProduct;
  deactivateProduct: typeof deactivateProduct;
  fetchCategories: typeof fetchCategories;
  fetchBrands: typeof fetchBrands;
  createBrand: typeof createBrand;
  generateInternalBarcode: typeof generateInternalBarcode;
  printLabels: typeof printLabels;
};

export const defaultProductsListScreenServices: ProductsListScreenServices = {
  fetchProducts,
  createProduct,
  editProduct,
  deactivateProduct,
  fetchCategories,
  fetchBrands,
  createBrand,
  generateInternalBarcode,
  printLabels,
};
