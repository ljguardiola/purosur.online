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
  generateInternalBarcode: typeof generateInternalBarcode;
  printLabels: typeof printLabels;
};

export const defaultProductsListScreenServices: ProductsListScreenServices = {
  fetchProducts,
  createProduct,
  editProduct,
  deactivateProduct,
  fetchCategories,
  generateInternalBarcode,
  printLabels,
};
