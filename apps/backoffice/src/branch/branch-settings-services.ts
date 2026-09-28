import { fetchBranchSettings, saveBranchSettings } from "./branch-settings-api";

export type BranchSettingsScreenServices = {
  fetchBranchSettings: typeof fetchBranchSettings;
  saveBranchSettings: typeof saveBranchSettings;
};

export const defaultBranchSettingsScreenServices: BranchSettingsScreenServices = {
  fetchBranchSettings,
  saveBranchSettings,
};
