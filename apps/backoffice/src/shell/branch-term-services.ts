import { fetchBranchSettings, saveBranchSettings } from "../branch/branch-settings-api";
import {
  fetchGoodConditionReturnDays,
  fetchSupplierPriceListDailyCap,
} from "../branch/branch-terms-api";
import type { ChangeBranchTermModalServices } from "./change-branch-term-modal";

export type BranchTermServices = ChangeBranchTermModalServices & {
  fetchGoodConditionReturnDays: typeof fetchGoodConditionReturnDays;
  fetchSupplierPriceListDailyCap: typeof fetchSupplierPriceListDailyCap;
};

export const defaultBranchTermServices: BranchTermServices = {
  fetchBranchSettings,
  saveBranchSettings,
  fetchGoodConditionReturnDays,
  fetchSupplierPriceListDailyCap,
};
