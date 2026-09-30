import {
  createDiscount,
  editDiscount,
  fetchDiscounts,
  fetchDiscountTargets,
} from "./discounts-api";
import type { EditDiscountModalServices } from "./edit-discount-modal";
import type { NewDiscountModalServices } from "./new-discount-modal";

export type DiscountsListScreenServices = {
  fetchDiscounts: typeof fetchDiscounts;
  fetchDiscountTargets: typeof fetchDiscountTargets;
} & NewDiscountModalServices &
  EditDiscountModalServices;

export const defaultDiscountsListScreenServices: DiscountsListScreenServices = {
  fetchDiscounts,
  fetchDiscountTargets,
  createDiscount,
  editDiscount,
};
