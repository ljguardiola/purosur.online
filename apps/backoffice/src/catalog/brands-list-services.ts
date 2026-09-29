import {
  createBrand,
  deactivateBrand,
  editBrand,
  fetchBrands,
  reactivateBrand,
} from "./brands-api";

export type BrandsListScreenServices = {
  fetchBrands: typeof fetchBrands;
  createBrand: typeof createBrand;
  editBrand: typeof editBrand;
  deactivateBrand: typeof deactivateBrand;
  reactivateBrand: typeof reactivateBrand;
};

export const defaultBrandsListScreenServices: BrandsListScreenServices = {
  fetchBrands,
  createBrand,
  editBrand,
  deactivateBrand,
  reactivateBrand,
};
